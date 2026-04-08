export type ChunkConfig = {
  mode: "row_per_item" | "dialogue_turns" | "paragraphs" | "sentences" | "sliding_window" | "custom_delimiter";
  text_column?: string;
  speaker_column?: string;
  context_columns?: string[];
  id_column?: string;
  turn_size?: number;
  window_size?: number;
  overlap?: number;
  custom_delimiter?: string;
  min_chunk_length?: number;
};

export type ParsedData = {
  columns: string[];
  rows: Array<Record<string, string>>;
  metadata?: Record<string, unknown>;
};

function splitSentences(text: string) {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

export function chunkData(parsed: ParsedData, cfg: ChunkConfig) {
  const mode = cfg.mode ?? "row_per_item";
  const textColumn = cfg.text_column ?? parsed.columns[0] ?? "text";
  if (mode === "row_per_item") {
    return parsed.rows.map((row, idx) => ({ ordering: idx + 1, content_text: row[textColumn] ?? "", context_json: row }));
  }
  if (mode === "paragraphs") {
    const all = parsed.rows.map((r) => r[textColumn] ?? "").join("\n");
    return all.split(/\n{2,}/).filter(Boolean).map((x, idx) => ({ ordering: idx + 1, content_text: x.trim(), context_json: {} }));
  }
  if (mode === "sentences") {
    const all = parsed.rows.map((r) => r[textColumn] ?? "").join(" ");
    return splitSentences(all).map((x, idx) => ({ ordering: idx + 1, content_text: x.trim(), context_json: {} }));
  }
  if (mode === "custom_delimiter") {
    const delim = cfg.custom_delimiter ? new RegExp(cfg.custom_delimiter, "g") : /\n+/g;
    const all = parsed.rows.map((r) => r[textColumn] ?? "").join("\n");
    return all.split(delim).filter(Boolean).map((x, idx) => ({ ordering: idx + 1, content_text: x.trim(), context_json: {} }));
  }
  if (mode === "dialogue_turns") {
    const turnSize = Math.max(1, cfg.turn_size ?? 1);
    const rows = parsed.rows.filter((r) => (r[textColumn] ?? "").trim().length > 0);
    const out: Array<{ ordering: number; content_text: string; context_json: Record<string, unknown> }> = [];
    for (let i = 0; i < rows.length; i += turnSize) {
      const batch = rows.slice(i, i + turnSize);
      const content = batch.map((r) => {
        const speaker = cfg.speaker_column ? r[cfg.speaker_column] : "";
        return speaker ? `${speaker}: ${r[textColumn]}` : r[textColumn];
      }).join("\n");
      out.push({ ordering: out.length + 1, content_text: content, context_json: { rows: batch } });
    }
    return out;
  }
  if (mode === "sliding_window") {
    const text = parsed.rows.map((r) => r[textColumn] ?? "").join(" ");
    const tokens = text.split(/\s+/).filter(Boolean);
    const size = Math.max(20, cfg.window_size ?? 80);
    const overlap = Math.max(0, Math.min(size - 1, cfg.overlap ?? 20));
    const step = Math.max(1, size - overlap);
    const out = [];
    for (let i = 0; i < tokens.length; i += step) {
      const piece = tokens.slice(i, i + size).join(" ");
      if (piece.trim().length < (cfg.min_chunk_length ?? 1)) continue;
      out.push({ ordering: out.length + 1, content_text: piece, context_json: { startToken: i } });
      if (i + size >= tokens.length) break;
    }
    return out;
  }
  return [];
}
