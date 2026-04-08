import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { requireAuth, getUser } from "./auth";
import { json, nowIso, parseJsonSafe, uid } from "./utils";
import { createProject, getActiveScheme, assertProjectMember } from "./db";
import { chunkData } from "./chunker";
import { parseFileByFormat } from "./fileParser";
import { runLlmWithFallback, pingLlm } from "./llm";
import { buildIrrSummary } from "./irr";
import {
  createNotification,
  maybeNotifyLowIrr,
  notifyConflictDetected,
  notifyMemberJoined,
  notifyNewMessage,
  notifyCodingSchemeUpdated
} from "./notifications";
import { StatsHub } from "./statsHub";
import { QwenRateLimiter } from "./qwenRateLimiter";
import { AlRunner } from "./alRunner";
import { ChatHub } from "./chatHub";

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

async function memberGuard(c: any, projectId: string) {
  const user = getUser(c);
  const member = await assertProjectMember(c.env, projectId, user.userId);
  if (!member) return json(c, { error: "forbidden" }, 403);
  return null;
}

app.get("/api/health", (c) => json(c, { status: "ok", time: nowIso() }));

app.use("/api/*", requireAuth);

app.get("/api/auth/me", async (c) => json(c, { user: getUser(c) }));
app.post("/api/auth/logout", async (c) => json(c, { ok: true }));

app.post("/api/projects", async (c) => {
  const user = getUser(c);
  const body = await c.req.json<any>();
  const projectId = await createProject(c.env, body, user.userId);
  const emails: string[] = Array.isArray(body.invite_emails) ? body.invite_emails : [];
  for (const email of emails.slice(0, 9)) {
    const uidLike = `email:${email.toLowerCase()}`;
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO users(user_id,email,display_name,created_at,last_active_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING").bind(uidLike, email, email.split("@")[0], nowIso(), nowIso()),
      c.env.DB.prepare("INSERT INTO project_members(project_id,user_id,role,joined_at) VALUES(?,?,?,?) ON CONFLICT(project_id,user_id) DO NOTHING").bind(projectId, uidLike, "coder", nowIso())
    ]);
  }
  return json(c, { project_id: projectId });
});

app.get("/api/projects", async (c) => {
  const user = getUser(c);
  const rows = await c.env.DB.prepare(
    "SELECT p.* FROM projects p INNER JOIN project_members m ON p.project_id=m.project_id WHERE m.user_id=? ORDER BY p.created_at DESC"
  ).bind(user.userId).all();
  return json(c, { projects: rows.results ?? [] });
});

app.get("/api/projects/:id", async (c) => {
  const projectId = c.req.param("id");
  const denied = await memberGuard(c, projectId);
  if (denied) return denied;
  const project = await c.env.DB.prepare("SELECT * FROM projects WHERE project_id=?").bind(projectId).first();
  const members = await c.env.DB.prepare(
    "SELECT pm.user_id,u.email,pm.role,pm.joined_at FROM project_members pm LEFT JOIN users u ON u.user_id=pm.user_id WHERE pm.project_id=?"
  ).bind(projectId).all();
  return json(c, { project, members: members.results ?? [] });
});

app.patch("/api/projects/:id", async (c) => {
  const projectId = c.req.param("id");
  const denied = await memberGuard(c, projectId);
  if (denied) return denied;
  const body = await c.req.json<any>();
  await c.env.DB.prepare("UPDATE projects SET name=COALESCE(?,name), description=COALESCE(?,description), settings_json=COALESCE(?,settings_json), updated_at=? WHERE project_id=?")
    .bind(body.name ?? null, body.description ?? null, body.settings_json ? JSON.stringify(body.settings_json) : null, nowIso(), projectId).run();
  if (Array.isArray(body.coding_scheme) && body.coding_scheme.length > 0) {
    const current = await getActiveScheme(c.env, projectId);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE coding_schemes SET is_active=0 WHERE project_id=?").bind(projectId),
      c.env.DB.prepare("INSERT INTO coding_schemes(scheme_id,project_id,version,labels_json,created_by,change_note,is_active,created_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(uid("scheme_"), projectId, (current.version ?? 0) + 1, JSON.stringify(body.coding_scheme), getUser(c).userId, "Updated via settings", 1, nowIso())
    ]);
  }
  return json(c, { ok: true });
});

app.delete("/api/projects/:id", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const project = await c.env.DB.prepare("SELECT owner_id FROM projects WHERE project_id=?").bind(projectId).first<{ owner_id: string }>();
  if (!project || project.owner_id !== user.userId) return json(c, { error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM projects WHERE project_id=?").bind(projectId).run();
  return json(c, { ok: true });
});

app.post("/api/projects/:id/members", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json<any>();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return json(c, { error: "email required" }, 400);
  const denied = await memberGuard(c, projectId);
  if (denied) return denied;
  const userId = `email:${email}`;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO users(user_id,email,display_name,created_at,last_active_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING").bind(userId, email, email.split("@")[0], nowIso(), nowIso()),
    c.env.DB.prepare("INSERT INTO project_members(project_id,user_id,role,joined_at) VALUES(?,?,?,?) ON CONFLICT(project_id,user_id) DO NOTHING").bind(projectId, userId, "coder", nowIso())
  ]);
  // Notify existing members
  const existing = await c.env.DB.prepare("SELECT user_id FROM project_members WHERE project_id=? AND user_id!=?").bind(projectId, userId).all<{ user_id: string }>();
  c.executionCtx.waitUntil(notifyMemberJoined(c.env, projectId, email, (existing.results ?? []).map((m) => m.user_id)));
  return json(c, { ok: true, user_id: userId });
});

app.delete("/api/projects/:id/members/:userId", async (c) => {
  const denied = await memberGuard(c, c.req.param("id"));
  if (denied) return denied;
  await c.env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND user_id=?").bind(c.req.param("id"), c.req.param("userId")).run();
  return json(c, { ok: true });
});

app.get("/api/projects/:id/members", async (c) => {
  const projectId = c.req.param("id");
  const denied = await memberGuard(c, projectId);
  if (denied) return denied;
  const rows = await c.env.DB.prepare(
    "SELECT pm.user_id,u.email,pm.role,pm.joined_at FROM project_members pm LEFT JOIN users u ON u.user_id=pm.user_id WHERE pm.project_id=?"
  ).bind(projectId).all();
  return json(c, { members: rows.results ?? [] });
});

app.post("/api/projects/:id/datasets/upload", async (c) => {
  const projectId = c.req.param("id");
  const denied = await memberGuard(c, projectId);
  if (denied) return denied;
  const body = await c.req.json<any>();
  const datasetId = uid("ds_");
  const key = `${projectId}/${datasetId}/${body.filename ?? "dataset.txt"}`;
  const text = body.content_base64 ? atob(body.content_base64) : "";
  if (c.env.UPLOADS) {
    await c.env.UPLOADS.put(key, text);
  } else {
    // R2 not enabled: store content inline in D1 as a fallback (limited to ~50KB)
    await c.env.DB.prepare("INSERT INTO config(project_id,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(project_id,key) DO UPDATE SET value=excluded.value").bind(projectId, `dataset_content:${datasetId}`, text.slice(0, 50000), nowIso()).run();
  }
  await c.env.DB.prepare(
    "INSERT INTO datasets(dataset_id,project_id,filename,file_format,r2_key,row_count,chunk_config_json,status,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).bind(datasetId, projectId, body.filename ?? "dataset.txt", body.file_format ?? "txt", key, 0, "{}", "uploaded", getUser(c).userId, nowIso()).run();
  return json(c, { dataset_id: datasetId });
});

app.post("/api/projects/:id/datasets/:datasetId/preview", async (c) => {
  const projectId = c.req.param("id");
  const datasetId = c.req.param("datasetId");
  const denied = await memberGuard(c, projectId);
  if (denied) return denied;
  const ds = await c.env.DB.prepare("SELECT * FROM datasets WHERE dataset_id=? AND project_id=?").bind(datasetId, projectId).first<any>();
  if (!ds) return json(c, { error: "dataset_not_found" }, 404);
  let text = "";
  if (c.env.UPLOADS) {
    const obj = await c.env.UPLOADS.get(ds.r2_key);
    if (!obj) return json(c, { error: "missing_r2_object" }, 404);
    text = await obj.text();
  } else {
    const row = await c.env.DB.prepare("SELECT value FROM config WHERE project_id=? AND key=?").bind(projectId, `dataset_content:${datasetId}`).first<any>();
    text = row?.value ?? "";
  }
  const bytes = new TextEncoder().encode(text).buffer;
  const parsed = await parseFileByFormat(ds.file_format, bytes);
  return json(c, { columns: parsed.columns, preview: parsed.rows.slice(0, 20) });
});

app.post("/api/projects/:id/datasets/:datasetId/configure", async (c) => {
  const body = await c.req.json<any>();
  await c.env.DB.prepare("UPDATE datasets SET chunk_config_json=? WHERE dataset_id=? AND project_id=?").bind(JSON.stringify(body), c.req.param("datasetId"), c.req.param("id")).run();
  return json(c, { ok: true });
});

app.post("/api/projects/:id/datasets/:datasetId/process", async (c) => {
  const projectId = c.req.param("id");
  const datasetId = c.req.param("datasetId");
  const ds = await c.env.DB.prepare("SELECT * FROM datasets WHERE dataset_id=? AND project_id=?").bind(datasetId, projectId).first<any>();
  if (!ds) return json(c, { error: "dataset_not_found" }, 404);
  let text2 = "";
  if (c.env.UPLOADS) {
    const obj = await c.env.UPLOADS.get(ds.r2_key);
    if (!obj) return json(c, { error: "missing_r2_object" }, 404);
    text2 = await obj.text();
  } else {
    const row = await c.env.DB.prepare("SELECT value FROM config WHERE project_id=? AND key=?").bind(projectId, `dataset_content:${datasetId}`).first<any>();
    text2 = row?.value ?? "";
  }
  const bytes = new TextEncoder().encode(text2).buffer;
  const parsed = await parseFileByFormat(ds.file_format, bytes);
  const cfg = parseJsonSafe(ds.chunk_config_json, { mode: "row_per_item" });
  const chunks = chunkData(parsed, cfg as any);
  await c.env.DB.prepare("DELETE FROM data_items WHERE project_id=? AND dataset_id=?").bind(projectId, datasetId).run();
  for (const chunk of chunks) {
    await c.env.DB.prepare(
      "INSERT INTO data_items(item_id,dataset_id,project_id,ordering,content_text,context_json,meta_json,source_row,chunk_index,parent_doc_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(uid("itm_"), datasetId, projectId, chunk.ordering, chunk.content_text, JSON.stringify(chunk.context_json ?? {}), "{}", null, chunk.ordering, null, nowIso()).run();
  }
  await c.env.DB.prepare("UPDATE datasets SET row_count=?, status='ready' WHERE dataset_id=?").bind(chunks.length, datasetId).run();
  return json(c, { ok: true, count: chunks.length });
});

app.get("/api/projects/:id/datasets", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM datasets WHERE project_id=? ORDER BY created_at DESC").bind(c.req.param("id")).all();
  return json(c, { datasets: rows.results ?? [] });
});

app.get("/api/projects/:id/data-items", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM data_items WHERE project_id=? ORDER BY ordering LIMIT 500").bind(c.req.param("id")).all();
  return json(c, { items: rows.results ?? [] });
});

app.get("/api/projects/:id/data-items/:itemId", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM data_items WHERE project_id=? AND item_id=?").bind(c.req.param("id"), c.req.param("itemId")).first();
  return json(c, { item: row });
});

app.get("/api/projects/:id/coding-scheme", async (c) => {
  const scheme = await getActiveScheme(c.env, c.req.param("id"));
  return json(c, scheme);
});

app.post("/api/projects/:id/coding-scheme", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json<any>();
  const current = await getActiveScheme(c.env, projectId);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE coding_schemes SET is_active=0 WHERE project_id=?").bind(projectId),
    c.env.DB.prepare("INSERT INTO coding_schemes(scheme_id,project_id,version,labels_json,created_by,change_note,is_active,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(uid("scheme_"), projectId, (current.version ?? 0) + 1, JSON.stringify(body.labels ?? []), getUser(c).userId, body.change_note ?? "", 1, nowIso())
  ]);
  return json(c, { ok: true });
});

app.get("/api/projects/:id/coding-scheme/history", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM coding_schemes WHERE project_id=? ORDER BY version DESC").bind(c.req.param("id")).all();
  return json(c, { history: rows.results ?? [] });
});

app.post("/api/projects/:id/assignments/generate", async (c) => {
  const projectId = c.req.param("id");
  const members = await c.env.DB.prepare("SELECT user_id FROM project_members WHERE project_id=?").bind(projectId).all<{ user_id: string }>();
  const items = await c.env.DB.prepare("SELECT item_id, ordering FROM data_items WHERE project_id=? ORDER BY ordering").bind(projectId).all<{ item_id: string; ordering: number }>();
  for (const m of members.results ?? []) {
    for (const it of items.results ?? []) {
      await c.env.DB.prepare(
        "INSERT INTO assignments(project_id,user_id,item_id,phase,task,status,ordering,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id,user_id,item_id,phase,task) DO NOTHING"
      ).bind(projectId, m.user_id, it.item_id, "normal", "manual", "todo", it.ordering, nowIso()).run();
    }
  }
  return json(c, { ok: true, members: (members.results ?? []).length, items: (items.results ?? []).length });
});

app.get("/api/projects/:id/assignments/my", async (c) => {
  const user = getUser(c);
  const rows = await c.env.DB.prepare("SELECT * FROM assignments WHERE project_id=? AND user_id=? ORDER BY ordering").bind(c.req.param("id"), user.userId).all();
  return json(c, { assignments: rows.results ?? [] });
});

app.get("/api/projects/:id/assignments/progress", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT user_id, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, COUNT(*) AS total FROM assignments WHERE project_id=? GROUP BY user_id"
  ).bind(c.req.param("id")).all();
  return json(c, { progress: rows.results ?? [] });
});

app.get("/api/projects/:id/labeling/next", async (c) => {
  const user = getUser(c);
  const phase = c.req.query("phase") ?? "normal";
  const task = c.req.query("task") ?? "manual";
  const row = await c.env.DB.prepare(
    "SELECT a.item_id, d.content_text, d.context_json FROM assignments a INNER JOIN data_items d ON d.item_id=a.item_id WHERE a.project_id=? AND a.user_id=? AND a.phase=? AND a.task=? AND a.status='todo' ORDER BY a.ordering LIMIT 1"
  ).bind(c.req.param("id"), user.userId, phase, task).first<any>();
  const prog = await c.env.DB.prepare(
    "SELECT SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, COUNT(*) AS total FROM assignments WHERE project_id=? AND user_id=? AND phase=? AND task=?"
  ).bind(c.req.param("id"), user.userId, phase, task).first<any>();
  return json(c, { item: row, progress: { done: Number(prog?.done ?? 0), total: Number(prog?.total ?? 0) } });
});

app.post("/api/projects/:id/labeling/submit", async (c) => {
  const user = getUser(c);
  const projectId = c.req.param("id");
  const body = await c.req.json<any>();
  const scheme = await getActiveScheme(c.env, projectId);
  const attemptId = uid("attempt_");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO manual_labels(project_id,user_id,item_id,phase,label,scheme_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id,user_id,item_id,phase) DO UPDATE SET label=excluded.label, updated_at=excluded.updated_at"
    ).bind(projectId, user.userId, body.item_id, body.phase ?? "normal", body.label, scheme.version ?? 1, nowIso(), nowIso()),
    c.env.DB.prepare("UPDATE assignments SET status='done' WHERE project_id=? AND user_id=? AND item_id=? AND phase=? AND task='manual'")
      .bind(projectId, user.userId, body.item_id, body.phase ?? "normal"),
    c.env.DB.prepare(
      "INSERT INTO label_attempts(attempt_id,project_id,user_id,item_id,phase,task,llm_mode,selected_option,display_at_epoch_ms,answer_at_epoch_ms,active_ms,hidden_ms,idle_ms,hidden_count,blur_count,is_valid,invalid_reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      attemptId,
      projectId,
      user.userId,
      body.item_id,
      body.phase ?? "normal",
      "manual",
      null,
      body.label,
      body.attempt?.display_at_epoch_ms ?? null,
      body.attempt?.answer_at_epoch_ms ?? null,
      body.attempt?.active_ms ?? null,
      body.attempt?.hidden_ms ?? null,
      body.attempt?.idle_ms ?? null,
      body.attempt?.hidden_count ?? 0,
      body.attempt?.blur_count ?? 0,
      1,
      "",
      nowIso()
    )
  ]);
  const overlap = await c.env.DB.prepare(
    "SELECT item_id, json_group_object(user_id,label) AS labels FROM manual_labels WHERE project_id=? GROUP BY item_id HAVING COUNT(*)>1"
  ).bind(projectId).all<any>();
  const matrix = (overlap.results ?? []).map((r) => ({ itemId: r.item_id, labels: parseJsonSafe(r.labels, {}) }));
  if (matrix.length > 0) {
    const summary = buildIrrSummary(matrix);
    await maybeNotifyLowIrr(c.env, projectId, summary.fleiss_kappa);
  }
  return json(c, { ok: true });
});

app.post("/api/projects/:id/labeling/undo", async (c) => {
  const user = getUser(c);
  const body = await c.req.json<any>();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM manual_labels WHERE project_id=? AND user_id=? AND item_id=? AND phase=?").bind(c.req.param("id"), user.userId, body.item_id, body.phase ?? "normal"),
    c.env.DB.prepare("UPDATE assignments SET status='todo' WHERE project_id=? AND user_id=? AND item_id=? AND phase=? AND task='manual'").bind(c.req.param("id"), user.userId, body.item_id, body.phase ?? "normal")
  ]);
  return json(c, { ok: true });
});

app.get("/api/projects/:id/labeling/item/:itemId", async (c) => {
  const user = getUser(c);
  const itemId = c.req.param("itemId");
  const item = await c.env.DB.prepare("SELECT * FROM data_items WHERE project_id=? AND item_id=?").bind(c.req.param("id"), itemId).first<any>();
  const my = await c.env.DB.prepare("SELECT label FROM manual_labels WHERE project_id=? AND user_id=? AND item_id=? ORDER BY updated_at DESC LIMIT 1").bind(c.req.param("id"), user.userId, itemId).first<any>();
  const llm = await c.env.DB.prepare("SELECT accepted_label,predicted_label FROM llm_labels WHERE project_id=? AND item_id=? ORDER BY created_at DESC LIMIT 1").bind(c.req.param("id"), itemId).first<any>();
  return json(c, { item, my_label: my?.label ?? null, llm_label: llm?.accepted_label ?? llm?.predicted_label ?? null });
});

app.get("/api/projects/:id/labeling/item/:itemId/comparison", async (c) => {
  const data = await c.env.DB.prepare(
    "SELECT ml.label AS manual_label, ll.accepted_label, ll.predicted_label FROM manual_labels ml LEFT JOIN llm_labels ll ON ll.project_id=ml.project_id AND ll.item_id=ml.item_id WHERE ml.project_id=? AND ml.item_id=? LIMIT 1"
  ).bind(c.req.param("id"), c.req.param("itemId")).first<any>();
  return json(c, { comparison: data ?? null });
});

app.post("/api/projects/:id/llm/run", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json<any>();
  const item = await c.env.DB.prepare("SELECT content_text FROM data_items WHERE project_id=? AND item_id=?").bind(projectId, body.item_id).first<any>();
  if (!item) return json(c, { error: "item_not_found" }, 404);
  const scheme = await getActiveScheme(c.env, projectId);
  const prompts = await c.env.DB.prepare("SELECT prompt_key,prompt_text FROM prompts WHERE project_id=?").bind(projectId).all<any>();
  const pMap = Object.fromEntries((prompts.results ?? []).map((p: any) => [p.prompt_key, p.prompt_text]));
  const mode = (body.mode ?? "prompt1") as "prompt1" | "prompt2" | "custom";
  const prompt = mode === "custom" ? (body.custom_prompt_text ?? "") : (pMap[mode] ?? "");
  const out = await runLlmWithFallback(c.env, { text: item.content_text, labels: (scheme.labels ?? []).map((x: any) => x.code), prompt, mode });
  await c.env.DB.prepare(
    "INSERT INTO llm_labels(project_id,item_id,phase,mode,predicted_label,accepted_label,accepted_by,raw_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,item_id,phase,mode) DO UPDATE SET predicted_label=excluded.predicted_label, raw_json=excluded.raw_json, model=excluded.model, created_at=excluded.created_at"
  ).bind(projectId, body.item_id, body.phase ?? "normal", mode, out.label, null, null, out.raw, out.model, nowIso()).run();
  return json(c, { predicted_label: out.label, provider: out.provider, model: out.model, raw_text: out.raw });
});

app.post("/api/projects/:id/llm/run-batch", async (c) => {
  const body = await c.req.json<any>();
  const items = Array.isArray(body.item_ids) ? body.item_ids : [];
  const results = [];
  for (const itemId of items) {
    const r = await app.request(`/api/projects/${c.req.param("id")}/llm/run`, { method: "POST", body: JSON.stringify({ ...body, item_id: itemId }) }, c.env, c.executionCtx);
    results.push(await r.json());
  }
  return json(c, { results });
});

app.post("/api/projects/:id/llm/accept", async (c) => {
  const body = await c.req.json<any>();
  const user = getUser(c);
  await c.env.DB.prepare("UPDATE llm_labels SET accepted_label=?, accepted_by=? WHERE project_id=? AND item_id=? AND phase=? AND mode=?")
    .bind(body.accepted_label, user.userId, c.req.param("id"), body.item_id, body.phase ?? "normal", body.mode ?? "prompt1").run();
  return json(c, { ok: true });
});

app.get("/api/projects/:id/llm/custom/count", async (c) => {
  const itemId = c.req.query("item_id");
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS cnt FROM llm_labels WHERE project_id=? AND item_id=? AND mode='custom'").bind(c.req.param("id"), itemId).first<any>();
  const count = Number(row?.cnt ?? 0);
  return json(c, { count, max: 5, exhausted: count >= 5 });
});

app.post("/api/llm/ping", async (c) => json(c, await pingLlm(c.env)));

app.get("/api/projects/:id/prompts", async (c) => {
  const rows = await c.env.DB.prepare("SELECT prompt_key,prompt_text FROM prompts WHERE project_id=?").bind(c.req.param("id")).all<any>();
  const map: Record<string, string> = {};
  for (const r of rows.results ?? []) map[r.prompt_key] = r.prompt_text;
  return json(c, { prompt1: map.prompt1 ?? "", prompt2: map.prompt2 ?? "" });
});

app.post("/api/projects/:id/prompts", async (c) => {
  const body = await c.req.json<any>();
  if (body.prompt1 != null) await c.env.DB.prepare("INSERT INTO prompts(project_id,prompt_key,prompt_text,version,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(project_id,prompt_key) DO UPDATE SET prompt_text=excluded.prompt_text, version=prompts.version+1, updated_at=excluded.updated_at").bind(c.req.param("id"), "prompt1", body.prompt1, 1, nowIso()).run();
  if (body.prompt2 != null) await c.env.DB.prepare("INSERT INTO prompts(project_id,prompt_key,prompt_text,version,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(project_id,prompt_key) DO UPDATE SET prompt_text=excluded.prompt_text, version=prompts.version+1, updated_at=excluded.updated_at").bind(c.req.param("id"), "prompt2", body.prompt2, 1, nowIso()).run();
  return json(c, { ok: true });
});

app.post("/api/projects/:id/al/run", async (c) => {
  const runId = uid("al_");
  await c.env.DB.prepare("INSERT INTO al_runs(run_id,project_id,created_at,status,detail_json) VALUES(?,?,?,?,?)")
    .bind(runId, c.req.param("id"), nowIso(), "done", JSON.stringify({ note: "Placeholder AL run. Use run-step for full ED-AL." })).run();
  return json(c, { run_id: runId, status: "done" });
});

app.post("/api/projects/:id/al/run-step", async (c) => {
  await c.env.DB.prepare("UPDATE al_runs SET status='done' WHERE project_id=? AND status='running'").bind(c.req.param("id")).run();
  return json(c, { ok: true });
});

app.get("/api/projects/:id/al/status", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM al_runs WHERE run_id=? AND project_id=?").bind(c.req.query("run_id"), c.req.param("id")).first<any>();
  return json(c, row ?? { status: "unknown" });
});

app.post("/api/projects/:id/al/ensure-assignments", async (c) => json(c, { ok: true, status: "already_ready" }));
app.get("/api/projects/:id/al/scores", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM al_scores WHERE project_id=? ORDER BY score DESC").bind(c.req.param("id")).all();
  return json(c, { scores: rows.results ?? [] });
});

app.post("/api/projects/:id/irr/calculate", async (c) => {
  const projectId = c.req.param("id");
  const rows = await c.env.DB.prepare(
    "SELECT item_id, json_group_object(user_id,label) AS labels FROM manual_labels WHERE project_id=? GROUP BY item_id HAVING COUNT(*) > 1"
  ).bind(projectId).all<any>();
  const matrix = (rows.results ?? []).map((r) => ({ itemId: r.item_id, labels: parseJsonSafe<Record<string, string>>(r.labels, {}) }));
  const summary = buildIrrSummary(matrix);
  const rowId = uid("irr_");
  await c.env.DB.prepare(
    "INSERT INTO irr_snapshots(snapshot_id,project_id,calculated_at,total_items,overlapping_items,cohens_kappa,fleiss_kappa,krippendorffs_alpha,percent_agreement,per_category_json,rater_pair_json,confusion_matrix_json,triggered_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    rowId,
    projectId,
    nowIso(),
    summary.total_items,
    summary.overlapping_items,
    null,
    summary.fleiss_kappa,
    summary.krippendorffs_alpha,
    summary.percent_agreement,
    JSON.stringify({}),
    JSON.stringify(summary.pairwise),
    JSON.stringify({}),
    "manual"
  ).run();
  await maybeNotifyLowIrr(c.env, projectId, summary.fleiss_kappa);
  return json(c, { snapshot_id: rowId, ...summary });
});

app.get("/api/projects/:id/irr/latest", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM irr_snapshots WHERE project_id=? ORDER BY calculated_at DESC LIMIT 1").bind(c.req.param("id")).first<any>();
  return json(c, row ?? {});
});
app.get("/api/projects/:id/irr/history", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM irr_snapshots WHERE project_id=? ORDER BY calculated_at DESC LIMIT 200").bind(c.req.param("id")).all();
  return json(c, { snapshots: rows.results ?? [] });
});
app.get("/api/projects/:id/irr/per-category", async (c) => json(c, { per_category: {} }));
app.get("/api/projects/:id/irr/pairwise", async (c) => {
  const row = await c.env.DB.prepare("SELECT rater_pair_json FROM irr_snapshots WHERE project_id=? ORDER BY calculated_at DESC LIMIT 1").bind(c.req.param("id")).first<any>();
  return json(c, { pairwise: parseJsonSafe(row?.rater_pair_json, {}) });
});
app.get("/api/projects/:id/irr/confusion-matrix", async (c) => json(c, { confusion_matrix: {} }));
app.post("/api/projects/:id/irr/ai-suggest", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const suggestion = "Detected low agreement across several labels. Consider clarifying overlapping code definitions and adding positive/negative examples.";
  await c.env.DB.prepare(
    "INSERT INTO messages(message_id,project_id,item_id,conflict_id,user_id,content,message_type,created_at) VALUES(?,?,?,?,?,?,?,?)"
  ).bind(uid("msg_"), projectId, null, null, user.userId, suggestion, "suggestion", nowIso()).run();
  return json(c, { suggestion });
});

app.get("/api/projects/:id/conflicts", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM conflicts WHERE project_id=? ORDER BY detected_at DESC").bind(c.req.param("id")).all();
  return json(c, { conflicts: rows.results ?? [] });
});
app.get("/api/projects/:id/conflicts/:conflictId", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM conflicts WHERE project_id=? AND conflict_id=?").bind(c.req.param("id"), c.req.param("conflictId")).first();
  return json(c, { conflict: row });
});
app.post("/api/projects/:id/conflicts/detect", async (c) => {
  const projectId = c.req.param("id");
  const rows = await c.env.DB.prepare(
    "SELECT item_id, json_group_object(user_id,label) AS labels, COUNT(DISTINCT label) AS distinct_labels FROM manual_labels WHERE project_id=? GROUP BY item_id HAVING COUNT(*) > 1 AND COUNT(DISTINCT label) > 1"
  ).bind(projectId).all<any>();
  let created = 0;
  for (const row of rows.results ?? []) {
    const exists = await c.env.DB.prepare("SELECT conflict_id FROM conflicts WHERE project_id=? AND item_id=? AND status!='resolved' LIMIT 1").bind(projectId, row.item_id).first();
    if (exists) continue;
    await c.env.DB.prepare(
      "INSERT INTO conflicts(conflict_id,project_id,item_id,labels_json,status,resolved_label,resolved_by,resolution_note,detected_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
    ).bind(uid("conf_"), projectId, row.item_id, row.labels, "open", null, null, null, nowIso(), null).run();
    created += 1;
  }
  if (created > 0) {
    c.executionCtx.waitUntil(notifyConflictDetected(c.env, projectId, created));
  }
  return json(c, { created });
});
app.post("/api/projects/:id/conflicts/:conflictId/resolve", async (c) => {
  const body = await c.req.json<any>();
  await c.env.DB.prepare("UPDATE conflicts SET status='resolved', resolved_label=?, resolved_by=?, resolution_note=?, resolved_at=? WHERE project_id=? AND conflict_id=?")
    .bind(body.resolved_label, getUser(c).userId, body.resolution_note ?? "", nowIso(), c.req.param("id"), c.req.param("conflictId")).run();
  return json(c, { ok: true });
});
app.post("/api/projects/:id/conflicts/:conflictId/reopen", async (c) => {
  await c.env.DB.prepare("UPDATE conflicts SET status='open', resolved_label=NULL, resolved_by=NULL, resolution_note=NULL, resolved_at=NULL WHERE project_id=? AND conflict_id=?")
    .bind(c.req.param("id"), c.req.param("conflictId")).run();
  return json(c, { ok: true });
});

app.get("/api/projects/:id/messages", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM messages WHERE project_id=? ORDER BY created_at DESC LIMIT 200").bind(c.req.param("id")).all();
  return json(c, { messages: rows.results ?? [] });
});
app.get("/api/projects/:id/messages/item/:itemId", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM messages WHERE project_id=? AND item_id=? ORDER BY created_at DESC LIMIT 200").bind(c.req.param("id"), c.req.param("itemId")).all();
  return json(c, { messages: rows.results ?? [] });
});
app.get("/api/projects/:id/messages/conflict/:conflictId", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM messages WHERE project_id=? AND conflict_id=? ORDER BY created_at DESC LIMIT 200").bind(c.req.param("id"), c.req.param("conflictId")).all();
  return json(c, { messages: rows.results ?? [] });
});
app.post("/api/projects/:id/messages", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const body = await c.req.json<any>();
  const messageId = uid("msg_");
  await c.env.DB.prepare(
    "INSERT INTO messages(message_id,project_id,item_id,conflict_id,user_id,content,message_type,created_at) VALUES(?,?,?,?,?,?,?,?)"
  ).bind(messageId, projectId, body.item_id ?? null, body.conflict_id ?? null, user.userId, body.content ?? "", body.message_type ?? "chat", nowIso()).run();
  const hubId = c.env.CHAT_HUB.idFromName(projectId);
  const msgPayload = JSON.stringify({ message_id: messageId, user_id: user.userId, content: body.content, message_type: body.message_type ?? "chat", created_at: nowIso(), item_id: body.item_id ?? null });
  c.executionCtx.waitUntil(c.env.CHAT_HUB.get(hubId).fetch("https://chat.internal/broadcast", { method: "POST", body: msgPayload }));
  if (body.message_type !== "system" && body.message_type !== "suggestion") {
    c.executionCtx.waitUntil(notifyNewMessage(c.env, projectId, user.userId, body.message_type === "note" ? "note" : "chat", body.content ?? "", body.item_id));
  }
  return json(c, { ok: true, message_id: messageId });
});
app.get("/api/projects/:id/messages/stream", async (c) => {
  const id = c.env.CHAT_HUB.idFromName(c.req.param("id"));
  return c.env.CHAT_HUB.get(id).fetch("https://chat.internal/ws", c.req.raw);
});

app.get("/api/projects/:id/notifications", async (c) => {
  const user = getUser(c);
  const rows = await c.env.DB.prepare("SELECT * FROM notifications WHERE project_id=? AND user_id=? ORDER BY created_at DESC LIMIT 200").bind(c.req.param("id"), user.userId).all();
  return json(c, { notifications: rows.results ?? [] });
});
app.post("/api/projects/:id/notifications/read", async (c) => {
  const user = getUser(c);
  const body = await c.req.json<any>();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) {
    await c.env.DB.prepare("UPDATE notifications SET is_read=1 WHERE project_id=? AND user_id=?").bind(c.req.param("id"), user.userId).run();
  } else {
    for (const id of ids) await c.env.DB.prepare("UPDATE notifications SET is_read=1 WHERE notification_id=? AND user_id=?").bind(id, user.userId).run();
  }
  return json(c, { ok: true });
});
app.get("/api/projects/:id/notifications/stream", async (c) => {
  const id = c.env.STATS_HUB.idFromName(`notifications:${c.req.param("id")}`);
  return c.env.STATS_HUB.get(id).fetch("https://stats.internal/ws", c.req.raw);
});

app.get("/api/projects/:id/stats/overview", async (c) => {
  const projectId = c.req.param("id");
  const [items, labels, conflicts] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM data_items WHERE project_id=?").bind(projectId).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM manual_labels WHERE project_id=?").bind(projectId).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM conflicts WHERE project_id=? AND status='open'").bind(projectId).first<any>()
  ]);
  const dist = await c.env.DB.prepare("SELECT label, COUNT(*) AS cnt FROM manual_labels WHERE project_id=? GROUP BY label").bind(projectId).all<any>();
  return json(c, {
    total_items: Number(items?.n ?? 0),
    total_labels: Number(labels?.n ?? 0),
    open_conflicts: Number(conflicts?.n ?? 0),
    labels: (dist.results ?? []).map((x) => x.label),
    values: (dist.results ?? []).map((x) => Number(x.cnt ?? 0))
  });
});
app.get("/api/projects/:id/stats/per-member", async (c) => {
  const rows = await c.env.DB.prepare("SELECT user_id, COUNT(*) AS labeled FROM manual_labels WHERE project_id=? GROUP BY user_id").bind(c.req.param("id")).all();
  return json(c, { members: rows.results ?? [] });
});
app.get("/api/projects/:id/stats/label-distribution", async (c) => {
  const rows = await c.env.DB.prepare("SELECT label, COUNT(*) AS cnt FROM manual_labels WHERE project_id=? GROUP BY label").bind(c.req.param("id")).all();
  return json(c, { distribution: rows.results ?? [] });
});
app.get("/api/projects/:id/stats/time-analysis", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT user_id, AVG(active_ms) AS avg_active_ms, AVG(idle_ms) AS avg_idle_ms FROM label_attempts WHERE project_id=? GROUP BY user_id"
  ).bind(c.req.param("id")).all();
  return json(c, { time: rows.results ?? [] });
});

app.get("/api/projects/:id/export", async (c) => {
  const projectId = c.req.param("id");
  const format = c.req.query("format") ?? "json";
  const payload = {
    projects: (await c.env.DB.prepare("SELECT * FROM projects WHERE project_id=?").bind(projectId).all()).results ?? [],
    members: (await c.env.DB.prepare("SELECT * FROM project_members WHERE project_id=?").bind(projectId).all()).results ?? [],
    data_items: (await c.env.DB.prepare("SELECT * FROM data_items WHERE project_id=?").bind(projectId).all()).results ?? [],
    manual_labels: (await c.env.DB.prepare("SELECT * FROM manual_labels WHERE project_id=?").bind(projectId).all()).results ?? [],
    llm_labels: (await c.env.DB.prepare("SELECT * FROM llm_labels WHERE project_id=?").bind(projectId).all()).results ?? [],
    conflicts: (await c.env.DB.prepare("SELECT * FROM conflicts WHERE project_id=?").bind(projectId).all()).results ?? [],
    irr: (await c.env.DB.prepare("SELECT * FROM irr_snapshots WHERE project_id=?").bind(projectId).all()).results ?? [],
    messages: (await c.env.DB.prepare("SELECT * FROM messages WHERE project_id=?").bind(projectId).all()).results ?? [],
    attempts: (await c.env.DB.prepare("SELECT * FROM label_attempts WHERE project_id=?").bind(projectId).all()).results ?? []
  };
  if (format === "json") return json(c, payload);
  const text = JSON.stringify(payload, null, 2);
  return new Response(text, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${projectId}.${format}"` } });
});

export { StatsHub, QwenRateLimiter, AlRunner, ChatHub };
export default app;
