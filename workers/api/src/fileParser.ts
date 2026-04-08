import type { ParsedData } from "./chunker";

function autoDelimiter(header: string): string {
  const counts = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  for (const ch of header) if (ch in counts) (counts as any)[ch]++;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
}

function parseCsvText(text: string): ParsedData {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((x) => x.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const delim = autoDelimiter(lines[0]);

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === delim && !inQuote) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  }

  const columns = parseLine(lines[0]).map((c) => c.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    columns.forEach((c, i) => { row[c] = (cells[i] ?? "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
  return { columns, rows };
}

function parseJsonData(text: string): ParsedData {
  try {
    const parsed = JSON.parse(text);
    let rows: Record<string, unknown>[] = [];
    if (Array.isArray(parsed)) rows = parsed;
    else if (Array.isArray(parsed.data)) rows = parsed.data;
    else if (Array.isArray(parsed.items)) rows = parsed.items;
    else if (Array.isArray(parsed.records)) rows = parsed.records;
    else rows = [parsed];

    function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
          Object.assign(result, flatten(v as Record<string, unknown>, key));
        } else {
          result[key] = String(v ?? "");
        }
      }
      return result;
    }

    const flatRows = rows.map((r) => flatten(r as Record<string, unknown>));
    const columns = Array.from(new Set(flatRows.flatMap((r) => Object.keys(r))));
    return { columns, rows: flatRows };
  } catch {
    return { columns: ["text"], rows: [{ text }] };
  }
}

function parseTxtText(text: string): ParsedData {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((x) => x.trim().length > 0);
  return { columns: ["text"], rows: lines.map((line) => ({ text: line })) };
}

function parseXlsxBinary(bytes: ArrayBuffer): ParsedData {
  // SheetJS is not available in standard Workers; parse the XLSX XML manually for simple files.
  // For complex XLSX, fall back to treating as text (users should upload CSV for structured data).
  try {
    const text = new TextDecoder("utf-8").decode(bytes);
    // Try to detect if it's actually a CSV uploaded with .xlsx extension
    if (!text.includes("PK\x03\x04")) {
      return parseCsvText(text);
    }
    // XLSX is a ZIP. Extract shared strings and sheet data via basic text search.
    // This is a best-effort extraction for Cloudflare Workers without native ZIP support.
    const sharedStringsMatch = text.match(/<sst[^>]*>([\s\S]*?)<\/sst>/);
    const sharedStrings: string[] = [];
    if (sharedStringsMatch) {
      const matches = sharedStringsMatch[1].matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g);
      for (const m of matches) sharedStrings.push(m[1]);
    }

    const sheetMatch = text.match(/<sheetData>([\s\S]*?)<\/sheetData>/);
    if (!sheetMatch) return { columns: ["text"], rows: [{ text: "(XLSX parse failed – please upload as CSV)" }] };

    const rowMatches = [...sheetMatch[1].matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
    const tableRows: string[][] = rowMatches.map((rowM) => {
      const cellMatches = [...rowM[1].matchAll(/<c[^>]*(?:t="s"[^>]*)?>[\s\S]*?<v>([^<]*)<\/v>/g)];
      const typedMatches = [...rowM[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)];
      return typedMatches.map((cellM) => {
        const attrs = cellM[1];
        const inner = cellM[2];
        const vMatch = inner.match(/<v>([^<]*)<\/v>/);
        if (!vMatch) return "";
        const val = vMatch[1];
        if (attrs.includes('t="s"')) return sharedStrings[parseInt(val)] ?? val;
        return val;
      });
    });

    if (tableRows.length === 0) return { columns: ["text"], rows: [] };
    const columns = tableRows[0].map((c, i) => c || `col${i + 1}`);
    const rows = tableRows.slice(1).map((row) => {
      const r: Record<string, string> = {};
      columns.forEach((c, i) => { r[c] = row[i] ?? ""; });
      return r;
    });
    return { columns, rows };
  } catch {
    return { columns: ["text"], rows: [{ text: "(XLSX parse error – please upload as CSV)" }] };
  }
}

function parseDocxText(bytes: ArrayBuffer): ParsedData {
  try {
    const text = new TextDecoder("utf-8").decode(bytes);
    // DOCX is a ZIP. Extract word/document.xml text content.
    const docXmlMatch = text.match(/word\/document\.xml([\s\S]{0,200000})/);
    if (docXmlMatch) {
      const xmlContent = docXmlMatch[1];
      // Extract paragraph text runs
      const paragraphs: string[] = [];
      const paraMatches = xmlContent.matchAll(/<w:p[\s>]([\s\S]*?)<\/w:p>/g);
      for (const pm of paraMatches) {
        const runs = [...pm[1].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)];
        const para = runs.map((r) => r[1]).join("").trim();
        if (para.length > 0) paragraphs.push(para);
      }
      if (paragraphs.length > 0) {
        return { columns: ["text"], rows: paragraphs.map((p) => ({ text: p })) };
      }
    }
    // Fallback: extract all text runs naively
    const textMatches = [...text.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)];
    const lines = textMatches.map((m) => m[1]).filter(Boolean);
    if (lines.length > 0) return { columns: ["text"], rows: lines.map((l) => ({ text: l })) };
    return { columns: ["text"], rows: [{ text: "(DOCX parse failed – no text extracted)" }] };
  } catch {
    return { columns: ["text"], rows: [{ text: "(DOCX parse error)" }] };
  }
}

function parsePdfText(bytes: ArrayBuffer): ParsedData {
  try {
    const text = new TextDecoder("latin1").decode(bytes);
    // PDF text extraction: look for BT (Begin Text) ... ET (End Text) blocks and Tj/TJ operators
    const lines: string[] = [];
    // Tj: (text)Tj
    const tjMatches = text.matchAll(/\(([^)]{1,2000})\)\s*Tj/g);
    for (const m of tjMatches) {
      const decoded = m[1].replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\\\/g, "\\").replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
      const trimmed = decoded.trim();
      if (trimmed.length > 1) lines.push(trimmed);
    }
    // TJ: [(text) offset (text)]TJ
    const tjArrMatches = text.matchAll(/\[((?:\([^)]*\)|\s*-?\d+\s*)+)\]\s*TJ/g);
    for (const m of tjArrMatches) {
      const parts = [...m[1].matchAll(/\(([^)]{1,1000})\)/g)].map((x) => x[1]);
      const combined = parts.join("").trim();
      if (combined.length > 1) lines.push(combined);
    }

    if (lines.length === 0) return { columns: ["text"], rows: [{ text: "(PDF parse failed – no text extracted; try uploading as TXT)" }] };

    // Group into paragraphs (heuristic: blank-ish items as separators)
    const paragraphs: string[] = [];
    let cur = "";
    for (const line of lines) {
      if (line.length < 3) {
        if (cur.trim()) { paragraphs.push(cur.trim()); cur = ""; }
      } else {
        cur += (cur ? " " : "") + line;
      }
    }
    if (cur.trim()) paragraphs.push(cur.trim());

    return { columns: ["text"], rows: (paragraphs.length ? paragraphs : lines).map((p) => ({ text: p })) };
  } catch {
    return { columns: ["text"], rows: [{ text: "(PDF parse error)" }] };
  }
}

export async function parseFileByFormat(format: string, bytes: ArrayBuffer): Promise<ParsedData> {
  const f = format.toLowerCase().replace(/^\./, "");
  if (f === "csv" || f === "tsv") {
    return parseCsvText(new TextDecoder().decode(bytes));
  }
  if (f === "json" || f === "jsonl") {
    const text = new TextDecoder().decode(bytes);
    if (f === "jsonl") {
      const lines = text.split("\n").filter(Boolean);
      const rows = lines.map((l) => { try { return JSON.parse(l); } catch { return { text: l }; } });
      const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      return { columns, rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]))) };
    }
    return parseJsonData(text);
  }
  if (f === "txt" || f === "text" || f === "md") {
    return parseTxtText(new TextDecoder().decode(bytes));
  }
  if (f === "xlsx" || f === "xls") {
    return parseXlsxBinary(bytes);
  }
  if (f === "docx" || f === "doc") {
    return parseDocxText(bytes);
  }
  if (f === "pdf") {
    return parsePdfText(bytes);
  }
  // Fallback: try as text
  try {
    return parseTxtText(new TextDecoder().decode(bytes));
  } catch {
    return { columns: ["text"], rows: [{ text: "(Unsupported file format)" }] };
  }
}
