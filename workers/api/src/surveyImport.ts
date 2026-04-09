import { unzipSync } from "fflate";
import type { Env } from "./types";
import { nowIso, uid } from "./utils";

export type SurveyImportBody = {
  provider?: "qualtrics" | "surveymonkey";
  /** Qualtrics API token (prefer env QUALTRICS_API_TOKEN in production). */
  api_token?: string;
  /** e.g. ca1, yul1, co1 — full host is {datacenter}.qualtrics.com */
  datacenter?: string;
  survey_id?: string;
  /** Export field id for open text, e.g. QID3_TEXT. If omitted, first *_TEXT key is used. */
  text_field?: string;
};

function qualtricsBase(datacenter: string): string {
  const dc = datacenter.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  return `https://${dc}.qualtrics.com/API/v3`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Parse Qualtrics export JSON (inside zip) into text rows. */
export function extractQualtricsTexts(json: unknown, textField?: string): string[] {
  const rows: string[] = [];
  const root = json as Record<string, unknown>;
  const responses =
    (root.responses as unknown[]) ??
    (root as { result?: { responses?: unknown[] } }).result?.responses ??
    (root as { Result?: { responses?: unknown[] } }).Result?.responses ??
    [];
  for (const resp of responses) {
    if (!resp || typeof resp !== "object") continue;
    const values =
      (resp as { values?: Record<string, unknown> }).values ??
      (resp as { Values?: Record<string, unknown> }).Values ??
      (resp as Record<string, unknown>);
    let text = "";
    if (textField && values[textField] != null) {
      text = String(values[textField]);
    } else {
      const keys = Object.keys(values).filter((k) => /_TEXT$/i.test(k) || /^QID\d+_TEXT$/i.test(k));
      const k = keys.sort()[0];
      if (k) text = String(values[k] ?? "");
    }
    if (text.trim()) rows.push(text.trim());
  }
  return rows;
}

async function ensureDataset(env: Env, projectId: string, userId: string): Promise<string> {
  const existing = await env.DB.prepare("SELECT dataset_id FROM data_items WHERE project_id=? LIMIT 1").bind(projectId).first<{ dataset_id: string }>();
  if (existing?.dataset_id) return existing.dataset_id;

  const datasetId = uid("ds_");
  const key = `${projectId}/${datasetId}/survey-import.placeholder`;
  if (env.UPLOADS) await env.UPLOADS.put(key, "");
  await env.DB.prepare(
    "INSERT INTO datasets(dataset_id,project_id,filename,file_format,r2_key,row_count,chunk_config_json,status,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).bind(datasetId, projectId, "survey-import.txt", "txt", key, 0, "{}", "ready", userId, nowIso()).run();
  return datasetId;
}

export async function runSurveyImport(
  env: Env,
  projectId: string,
  userId: string,
  body: SurveyImportBody
): Promise<{ ok: boolean; imported?: number; error?: string; detail?: string }> {
  const provider = body.provider ?? "qualtrics";
  const token = body.api_token?.trim() || env.QUALTRICS_API_TOKEN?.trim();

  if (provider === "qualtrics") {
    if (!token) return { ok: false, error: "missing_api_token", detail: "Provide api_token or set QUALTRICS_API_TOKEN secret." };
    const dc = (body.datacenter ?? "ca1").trim();
    const surveyId = body.survey_id?.trim();
    if (!surveyId) return { ok: false, error: "missing_survey_id" };

    const base = qualtricsBase(dc);
    const headers: HeadersInit = { "X-API-TOKEN": token, "Content-Type": "application/json" };

    const start = await fetch(`${base}/surveys/${surveyId}/export-responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({ format: "json", useLabels: true })
    });
    const startJson = (await start.json()) as { result?: { id?: string; progressId?: string; requestId?: string }; meta?: { error?: unknown } };
    if (!start.ok) {
      return { ok: false, error: "qualtrics_start_failed", detail: JSON.stringify(startJson) };
    }
    const progressId =
      startJson.result?.progressId ?? startJson.result?.id ?? startJson.result?.requestId;
    if (!progressId) return { ok: false, error: "qualtrics_no_progress_id", detail: JSON.stringify(startJson) };

    let fileId: string | undefined;
    for (let i = 0; i < 40; i++) {
      const prog = await fetch(`${base}/surveys/${surveyId}/export-responses/${progressId}`, { headers });
      const pj = (await prog.json()) as {
        result?: { status?: string; percentComplete?: number; fileId?: string; id?: string };
      };
      const st = pj.result?.status;
      if (st === "failed" || st === "cancelled") {
        return { ok: false, error: "qualtrics_export_failed", detail: JSON.stringify(pj) };
      }
      if (st === "complete") {
        fileId = pj.result?.fileId ?? pj.result?.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!fileId) return { ok: false, error: "qualtrics_export_timeout" };

    const fileRes = await fetch(`${base}/surveys/${surveyId}/export-responses/${fileId}/file`, { headers });
    if (!fileRes.ok) {
      return { ok: false, error: "qualtrics_file_fetch_failed", detail: await fileRes.text() };
    }
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    let parsedJson: unknown;
    try {
      const unzipped = unzipSync(buf);
      const jsonName = Object.keys(unzipped).find((n) => n.toLowerCase().endsWith(".json"));
      if (!jsonName) return { ok: false, error: "qualtrics_zip_no_json", detail: Object.keys(unzipped).join(",") };
      const text = new TextDecoder().decode(unzipped[jsonName]!);
      parsedJson = JSON.parse(text);
    } catch (e) {
      try {
        parsedJson = JSON.parse(new TextDecoder().decode(buf));
      } catch {
        return { ok: false, error: "qualtrics_parse_failed", detail: String(e) };
      }
    }

    const texts = extractQualtricsTexts(parsedJson, body.text_field);
    if (texts.length === 0) return { ok: false, error: "no_text_responses", detail: "Check text_field or open-ended questions." };

    const datasetId = await ensureDataset(env, projectId, userId);
    const maxRow = await env.DB.prepare("SELECT MAX(ordering) AS m FROM data_items WHERE project_id=?").bind(projectId).first<{ m: number | null }>();
    let ord = Number(maxRow?.m ?? 0) + 1;

    const BATCH = 80;
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      const stmts = slice.map((content_text) => {
        const o = ord++;
        return env.DB.prepare(
          "INSERT INTO data_items(item_id,dataset_id,project_id,ordering,content_text,context_json,meta_json,source_row,chunk_index,parent_doc_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
        ).bind(
          uid("itm_"),
          datasetId,
          projectId,
          o,
          content_text,
          JSON.stringify({ source: "qualtrics", survey_id: surveyId }),
          "{}",
          null,
          null,
          null,
          nowIso()
        );
      });
      await env.DB.batch(stmts);
    }

    const nRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM data_items WHERE dataset_id=?").bind(datasetId).first<{ n: number }>();
    await env.DB.prepare("UPDATE datasets SET row_count=? WHERE dataset_id=?").bind(Number(nRow?.n ?? 0), datasetId).run();

    return { ok: true, imported: texts.length };
  }

  if (provider === "surveymonkey") {
    if (!token) return { ok: false, error: "missing_api_token" };
    const surveyId = body.survey_id?.trim();
    if (!surveyId) return { ok: false, error: "missing_survey_id" };

    const headers: HeadersInit = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const texts: string[] = [];
    let next: string | null = `https://api.surveymonkey.com/v3/surveys/${surveyId}/responses/bulk?per_page=100`;
    let guard = 0;
    while (next && guard++ < 50) {
      const r = await fetch(next, { headers });
      const j = (await r.json()) as { data?: Array<{ pages?: Array<{ questions?: Array<{ answers?: Array<{ text?: string }> }> }> }>; links?: { next?: string } };
      if (!r.ok) return { ok: false, error: "surveymonkey_fetch_failed", detail: JSON.stringify(j) };
      for (const row of j.data ?? []) {
        for (const page of row.pages ?? []) {
          for (const q of page.questions ?? []) {
            for (const a of q.answers ?? []) {
              const t = (a.text ?? "").trim();
              if (t) texts.push(t);
            }
          }
        }
      }
      next = j.links?.next ?? null;
    }
    if (texts.length === 0) return { ok: false, error: "no_text_responses_sm" };

    const datasetId = await ensureDataset(env, projectId, userId);
    const maxRow = await env.DB.prepare("SELECT MAX(ordering) AS m FROM data_items WHERE project_id=?").bind(projectId).first<{ m: number | null }>();
    let ord = Number(maxRow?.m ?? 0) + 1;
    const BATCH = 80;
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      const stmts = slice.map((content_text) => {
        const o = ord++;
        return env.DB.prepare(
          "INSERT INTO data_items(item_id,dataset_id,project_id,ordering,content_text,context_json,meta_json,source_row,chunk_index,parent_doc_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
        ).bind(
          uid("itm_"),
          datasetId,
          projectId,
          o,
          content_text,
          JSON.stringify({ source: "surveymonkey", survey_id: surveyId }),
          "{}",
          null,
          null,
          null,
          nowIso()
        );
      });
      await env.DB.batch(stmts);
    }
    const nRow2 = await env.DB.prepare("SELECT COUNT(*) AS n FROM data_items WHERE dataset_id=?").bind(datasetId).first<{ n: number }>();
    await env.DB.prepare("UPDATE datasets SET row_count=? WHERE dataset_id=?").bind(Number(nRow2?.n ?? 0), datasetId).run();
    return { ok: true, imported: texts.length };
  }

  return { ok: false, error: "unknown_provider" };
}

export function buildRefiQdaXml(projectName: string, projectId: string, dataItems: Array<{ item_id: string; content_text?: string }>, manualLabels: Array<{ item_id: string; user_id: string; label: string }>, codesFromScheme: Array<{ code: string; description?: string; parent_code?: string }>): string {
  const esc = escapeXml;
  const guid = (s: string) => esc(s.replace(/[^a-zA-Z0-9_-]/g, "_"));

  const codeEls = codesFromScheme.map((c) => `    <Code guid="${guid(c.code)}" name="${esc(c.code)}" isCodable="true"><Description>${esc(c.description ?? "")}</Description></Code>`).join("\n");

  const safeCdata = (t: string) => (t ?? "").replace(/\]\]>/g, "]]]]><![CDATA[>");
  const sources = dataItems
    .map((di) => `    <TextSource guid="${guid(di.item_id)}" name="${guid(di.item_id)}"><PlainText><![CDATA[${safeCdata(di.content_text ?? "")}]]></PlainText></TextSource>`)
    .join("\n");

  const coding = manualLabels
    .map((ml) => {
      const cg = `${guid(ml.item_id)}_${guid(ml.user_id)}`;
      return `    <Coding guid="${cg}" targetGuid="${guid(ml.item_id)}"><CodeRef guid="${guid(ml.label)}" /></Coding>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<RefiProject xmlns="urn:QDA-REFI" name="${esc(projectName)}" originUri="${esc(`mnotation:${projectId}`)}">
  <CodeBook>
    <Codes>
${codeEls || "    <Code guid=\"misc\" name=\"MISC\" isCodable=\"true\"><Description></Description></Code>"}
    </Codes>
  </CodeBook>
  <Sources>
${sources}
  </Sources>
  <Codings>
${coding}
  </Codings>
</RefiProject>`;
}
