import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { requireAuth, getUser, createSessionCookieValue } from "./auth";
import { json, nowIso, parseJsonSafe, uid } from "./utils";
import { createProject, getActiveScheme, assertProjectMember } from "./db";
import { chunkData } from "./chunker";
import { parseFileByFormat } from "./fileParser";
import { runLlmWithFallback, pingLlm, suggestCodebookFromSamples } from "./llm";
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
import { buildLabelsArrowIpcBytes, buildLabelsParquetBytes, normalizeExportRow } from "./parquetExport";
import { backupAllD1TablesToR2 } from "./d1Backup";
import { buildRefiQdaXml, runSurveyImport } from "./surveyImport";

const DEFAULT_ALLOWED_ORIGINS = ["https://mnotation.pages.dev", "http://localhost:5173"];

function getAllowedOrigins(env: Env): Set<string> {
  const raw = env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(",");
  return new Set(
    raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
  );
}

function parseLimit(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

async function readJsonBody<T>(c: any): Promise<T | null> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return null;
  }
}

function requireFields(body: Record<string, unknown>, fields: string[]): string | null {
  for (const f of fields) {
    const value = body[f];
    if (value === undefined || value === null || value === "") return f;
  }
  return null;
}

function validateLabelingSubmission(input: {
  label: string;
  allowedLabels: Set<string>;
  itemExists: boolean;
  assignmentStatus: string | null;
}): { error: string; status: number } | null {
  if (!input.allowedLabels.has(String(input.label))) return { error: "invalid_label", status: 400 };
  if (!input.itemExists) return { error: "item_not_found", status: 404 };
  if (!input.assignmentStatus) return { error: "assignment_not_found", status: 400 };
  if (input.assignmentStatus !== "todo") return { error: "assignment_not_todo", status: 409 };
  return null;
}

function computePagingFromRows(
  cursor: number,
  limit: number,
  rowsList: Array<Array<{ rowid?: number }>>
): { nextCursor: number; hasMore: boolean } {
  const allRowIds = rowsList.flatMap((rows) => rows.map((r) => Number(r.rowid ?? 0)));
  const nextCursor = Math.max(cursor, ...allRowIds);
  const hasMore = rowsList.some((rows) => rows.length === limit);
  return { nextCursor, hasMore };
}

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({
  origin: (origin, c) => {
    if (!origin) return null;
    const allowed = getAllowedOrigins(c.env);
    return allowed.has(origin) ? origin : null;
  },
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization", "X-User-Email"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

app.onError((err, c) => {
  console.error("API error:", err);
  return json(c, { error: "internal_error" }, 500);
});

async function memberGuard(c: any, projectId: string) {
  const user = getUser(c);
  const member = await assertProjectMember(c.env, projectId, user.userId);
  if (!member) return json(c, { error: "forbidden" }, 403);
  return null;
}

async function getMemberRole(env: Env, projectId: string, userId: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?")
    .bind(projectId, userId).first<{ role: string }>();
  return row?.role ?? null;
}

function roleCanLabel(role: string | null): boolean {
  if (!role) return false;
  return role === "owner" || role === "admin" || role === "coder";
}

function roleCanResolveConflicts(role: string | null): boolean {
  if (!role) return false;
  return role === "owner" || role === "admin" || role === "reviewer";
}

async function appendAudit(
  env: Env,
  projectId: string,
  userId: string,
  action: string,
  resourceType?: string,
  resourceId?: string,
  detail?: Record<string, unknown>
) {
  await env.DB.prepare(
    "INSERT INTO audit_log(audit_id,project_id,user_id,action,resource_type,resource_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)"
  ).bind(uid("aud_"), projectId, userId, action, resourceType ?? null, resourceId ?? null, detail ? JSON.stringify(detail) : null, nowIso()).run();
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 300;

async function checkApiRateLimit(env: Env, bucketKey: string): Promise<boolean> {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT count, window_start_ms FROM api_rate_buckets WHERE bucket_key=?")
    .bind(bucketKey).first<{ count: number; window_start_ms: number }>();
  if (!row) {
    await env.DB.prepare("INSERT INTO api_rate_buckets(bucket_key,count,window_start_ms) VALUES(?,?,?)").bind(bucketKey, 1, now).run();
    return true;
  }
  if (now - row.window_start_ms > RATE_WINDOW_MS) {
    await env.DB.prepare("UPDATE api_rate_buckets SET count=1, window_start_ms=? WHERE bucket_key=?").bind(now, bucketKey).run();
    return true;
  }
  if (row.count >= RATE_MAX) return false;
  await env.DB.prepare("UPDATE api_rate_buckets SET count=count+1 WHERE bucket_key=?").bind(bucketKey).run();
  return true;
}

async function fireProjectWebhooks(env: Env, projectId: string, event: string, payload: Record<string, unknown>) {
  const rows = await env.DB.prepare("SELECT * FROM project_webhooks WHERE project_id=? AND enabled=1").bind(projectId).all<any>();
  const body = JSON.stringify({ event, project_id: projectId, ...payload, at: nowIso() });
  const tasks = (rows.results ?? []).map(async (wh: any) => {
    const events = parseJsonSafe<string[]>(wh.events_json, []);
    if (events.length > 0 && !events.includes(event) && !events.includes("*")) return;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-Mnotation-Event": event };
      if (wh.secret) headers["X-Mnotation-Signature"] = wh.secret;
      await fetch(wh.url, { method: "POST", headers, body });
    } catch (e) {
      console.error("webhook failed", wh.webhook_id, e);
    }
  });
  await Promise.allSettled(tasks);
}

const CUSTOM_PROMPT_MAX = 5;

async function consumeCustomPromptQuota(env: Env, projectId: string, itemId: string): Promise<number | null> {
  const row = await env.DB.prepare(
    `INSERT INTO llm_run_counts(project_id,item_id,run_count,updated_at)
     VALUES(?,?,1,?)
     ON CONFLICT(project_id,item_id) DO UPDATE SET
       run_count = llm_run_counts.run_count + 1,
       updated_at = excluded.updated_at
     WHERE llm_run_counts.run_count < ?
     RETURNING run_count`
  ).bind(projectId, itemId, nowIso(), CUSTOM_PROMPT_MAX).first<{ run_count: number }>();
  return row?.run_count ?? null;
}

async function getCustomPromptCount(env: Env, projectId: string, itemId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT run_count FROM llm_run_counts WHERE project_id=? AND item_id=?"
  ).bind(projectId, itemId).first<{ run_count: number }>();
  return Number(row?.run_count ?? 0);
}

app.get("/api/health", (c) => json(c, { status: "ok", time: nowIso() }));

// Cookie-based login (no Cloudflare Access needed)
app.post("/api/auth/login", async (c) => {
  if (!c.env.AUTH_COOKIE_SECRET) {
    return json(c, { error: "auth_unavailable" }, 503);
  }
  const body = await readJsonBody<{ email?: string; name?: string }>(c);
  if (!body) return json(c, { error: "invalid_json" }, 400);
  if (!body.email) return json(c, { error: "email required" }, 400);
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(c, { error: "invalid_email" }, 400);
  const displayName = body.name ?? email.split("@")[0];

  // Check if a user was pre-created via project invite (user_id = "email:xxx")
  const existing = await c.env.DB.prepare("SELECT user_id FROM users WHERE email=? LIMIT 1").bind(email).first<{ user_id: string }>();
  const userId = existing?.user_id ?? email;

  await c.env.DB.prepare(
    "INSERT INTO users(user_id, email, display_name, created_at, last_active_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=COALESCE(excluded.display_name, users.display_name), last_active_at=excluded.last_active_at"
  ).bind(userId, email, displayName, nowIso(), nowIso()).run();

  const cookieVal = await createSessionCookieValue({ email, name: displayName, userId }, c.env);
  const headers = new Headers();
  headers.set("Set-Cookie", `mnotation_user=${cookieVal}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=604800`);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true, user: { userId, email, displayName } }), { status: 200, headers });
});

app.use("/api/*", requireAuth);
app.use("/api/*", async (c, next) => {
  const user = getUser(c);
  if (!(await checkApiRateLimit(c.env, `uid:${user.userId}`))) {
    return json(c, { error: "rate_limited" }, 429);
  }
  await next();
});
app.use("/api/projects/:id", async (c, next) => {
  const denied = await memberGuard(c, c.req.param("id"));
  if (denied) return denied;
  await next();
});
app.use("/api/projects/:id/*", async (c, next) => {
  const denied = await memberGuard(c, c.req.param("id"));
  if (denied) return denied;
  await next();
});

app.get("/api/auth/me", async (c) => json(c, { user: getUser(c) }));
app.post("/api/auth/logout", async (c) => {
  const headers = new Headers();
  headers.set("Set-Cookie", "mnotation_user=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
});

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
  const [project, members] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM projects WHERE project_id=?").bind(projectId).first(),
    c.env.DB.prepare(
      "SELECT pm.user_id,u.email,pm.role,pm.joined_at FROM project_members pm LEFT JOIN users u ON u.user_id=pm.user_id WHERE pm.project_id=?"
    ).bind(projectId).all()
  ]);
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
    c.env.DB.prepare(
      "INSERT INTO project_members(project_id,user_id,role,joined_at) VALUES(?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role"
    ).bind(
      projectId,
      userId,
      ["coder", "reviewer", "guest", "admin"].includes(String(body.role ?? "")) ? String(body.role) : "coder",
      nowIso()
    )
  ]);
  // Notify existing members
  const existing = await c.env.DB.prepare("SELECT user_id FROM project_members WHERE project_id=? AND user_id!=?").bind(projectId, userId).all<{ user_id: string }>();
  c.executionCtx.waitUntil(notifyMemberJoined(c.env, projectId, email, (existing.results ?? []).map((m) => m.user_id)));
  return json(c, { ok: true, user_id: userId });
});

app.delete("/api/projects/:id/members/:userId", async (c) => {
  const projectId = c.req.param("id");
  const actor = getUser(c);
  const [project, actorMember] = await Promise.all([
    c.env.DB.prepare("SELECT owner_id FROM projects WHERE project_id=?").bind(projectId).first<{ owner_id: string }>(),
    c.env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?").bind(projectId, actor.userId).first<{ role: string }>()
  ]);
  const isOwner = project?.owner_id === actor.userId;
  const isAdmin = actorMember?.role === "admin";
  if (!isOwner && !isAdmin) return json(c, { error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND user_id=?").bind(projectId, c.req.param("userId")).run();
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
  const body = await readJsonBody<any>(c);
  if (!body) return json(c, { error: "invalid_json" }, 400);
  const missing = requireFields(body, ["filename", "file_format", "content_base64"]);
  if (missing) return json(c, { error: "missing_field", field: missing }, 400);
  const maxBase64Chars = Math.floor((10 * 1024 * 1024 * 4) / 3);
  if (String(body.content_base64).length > maxBase64Chars) {
    return json(c, { error: "payload_too_large", max_bytes: 10 * 1024 * 1024 }, 413);
  }
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
  const BATCH_SIZE = 100;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const ops = chunks.slice(i, i + BATCH_SIZE).map((chunk) =>
      c.env.DB.prepare(
        "INSERT INTO data_items(item_id,dataset_id,project_id,ordering,content_text,context_json,meta_json,source_row,chunk_index,parent_doc_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(uid("itm_"), datasetId, projectId, chunk.ordering, chunk.content_text, JSON.stringify(chunk.context_json ?? {}), "{}", null, chunk.ordering, null, nowIso())
    );
    await c.env.DB.batch(ops);
  }
  await c.env.DB.prepare("UPDATE datasets SET row_count=?, status='ready' WHERE dataset_id=?").bind(chunks.length, datasetId).run();
  return json(c, { ok: true, count: chunks.length });
});

app.get("/api/projects/:id/datasets", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM datasets WHERE project_id=? ORDER BY created_at DESC").bind(c.req.param("id")).all();
  return json(c, { datasets: rows.results ?? [] });
});

app.get("/api/projects/:id/data-items", async (c) => {
  const projectId = c.req.param("id");
  const limit = parseLimit(c.req.query("limit"), 200, 1000);
  const cursor = Number(c.req.query("cursor") ?? 0);
  const rows = await c.env.DB.prepare(
    "SELECT rowid,* FROM data_items WHERE project_id=? AND rowid>? ORDER BY rowid LIMIT ?"
  ).bind(projectId, cursor, limit).all<any>();
  const results = rows.results ?? [];
  const nextCursor = results.length > 0 ? Number(results[results.length - 1].rowid ?? cursor) : cursor;
  return json(c, {
    items: results.map(({ rowid, ...rest }: any) => rest),
    paging: { cursor, limit, next_cursor: nextCursor, has_more: results.length === limit }
  });
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
  const existingRows = await c.env.DB.prepare(
    "SELECT DISTINCT user_id, item_id FROM assignments WHERE project_id=? AND phase='normal' AND task='manual'"
  ).bind(projectId).all<{ user_id: string; item_id: string }>();
  const existingUsers = new Set<string>();
  const existingItems = new Set<string>();
  for (const row of existingRows.results ?? []) {
    existingUsers.add(row.user_id);
    existingItems.add(row.item_id);
  }
  const memberIds = (members.results ?? []).map((m) => m.user_id);
  const itemsList = items.results ?? [];
  const newMembers = memberIds.filter((id) => !existingUsers.has(id));
  const newItems = itemsList.filter((it) => !existingItems.has(it.item_id));
  const existingMemberIds = memberIds.filter((id) => existingUsers.has(id));
  const statements: D1PreparedStatement[] = [];
  for (const userId of newMembers) {
    for (const it of itemsList) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO assignments(project_id,user_id,item_id,phase,task,status,ordering,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id,user_id,item_id,phase,task) DO NOTHING"
        ).bind(projectId, userId, it.item_id, "normal", "manual", "todo", it.ordering, nowIso())
      );
    }
  }
  for (const userId of existingMemberIds) {
    for (const it of newItems) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO assignments(project_id,user_id,item_id,phase,task,status,ordering,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id,user_id,item_id,phase,task) DO NOTHING"
        ).bind(projectId, userId, it.item_id, "normal", "manual", "todo", it.ordering, nowIso())
      );
    }
  }
  const BATCH_SIZE = 100;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await c.env.DB.batch(statements.slice(i, i + BATCH_SIZE));
  }
  return json(c, {
    ok: true,
    members: memberIds.length,
    items: itemsList.length,
    inserted_candidates: statements.length,
    new_members: newMembers.length,
    new_items: newItems.length
  });
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
  const [row, prog] = await Promise.all([
    c.env.DB.prepare(
      "SELECT a.item_id, d.content_text, d.context_json FROM assignments a INNER JOIN data_items d ON d.item_id=a.item_id WHERE a.project_id=? AND a.user_id=? AND a.phase=? AND a.task=? AND a.status='todo' ORDER BY a.ordering LIMIT 1"
    ).bind(c.req.param("id"), user.userId, phase, task).first<any>(),
    c.env.DB.prepare(
      "SELECT SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, COUNT(*) AS total FROM assignments WHERE project_id=? AND user_id=? AND phase=? AND task=?"
    ).bind(c.req.param("id"), user.userId, phase, task).first<any>()
  ]);
  return json(c, { item: row, progress: { done: Number(prog?.done ?? 0), total: Number(prog?.total ?? 0) } });
});

app.post("/api/projects/:id/labeling/submit", async (c) => {
  const user = getUser(c);
  const projectId = c.req.param("id");
  const role = await getMemberRole(c.env, projectId, user.userId);
  if (!roleCanLabel(role)) return json(c, { error: "forbidden_role" }, 403);
  const body = await readJsonBody<any>(c);
  if (!body) return json(c, { error: "invalid_json" }, 400);
  const missing = requireFields(body, ["item_id", "label"]);
  if (missing) return json(c, { error: "missing_field", field: missing }, 400);
  const phase = body.phase ?? "normal";
  const scheme = await getActiveScheme(c.env, projectId);
  const allowedLabels = new Set<string>((scheme.labels ?? []).map((x: any) => String(x.code)));
  const [itemExists, assignment] = await Promise.all([
    c.env.DB.prepare("SELECT 1 AS ok FROM data_items WHERE project_id=? AND item_id=? LIMIT 1")
      .bind(projectId, body.item_id).first<{ ok: number }>(),
    c.env.DB.prepare(
      "SELECT status FROM assignments WHERE project_id=? AND user_id=? AND item_id=? AND phase=? AND task='manual' LIMIT 1"
    ).bind(projectId, user.userId, body.item_id, phase).first<{ status: string }>()
  ]);
  const submitValidation = validateLabelingSubmission({
    label: String(body.label),
    allowedLabels,
    itemExists: Boolean(itemExists),
    assignmentStatus: assignment?.status ?? null
  });
  if (submitValidation) return json(c, { error: submitValidation.error }, submitValidation.status);
  const attemptId = uid("attempt_");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO manual_labels(project_id,user_id,item_id,phase,label,scheme_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id,user_id,item_id,phase) DO UPDATE SET label=excluded.label, updated_at=excluded.updated_at"
    ).bind(projectId, user.userId, body.item_id, phase, body.label, scheme.version ?? 1, nowIso(), nowIso()),
    c.env.DB.prepare("UPDATE assignments SET status='done' WHERE project_id=? AND user_id=? AND item_id=? AND phase=? AND task='manual'")
      .bind(projectId, user.userId, body.item_id, phase),
    c.env.DB.prepare(
      "INSERT INTO label_attempts(attempt_id,project_id,user_id,item_id,phase,task,llm_mode,selected_option,display_at_epoch_ms,answer_at_epoch_ms,active_ms,hidden_ms,idle_ms,hidden_count,blur_count,is_valid,invalid_reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      attemptId,
      projectId,
      user.userId,
      body.item_id,
      phase,
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
  c.executionCtx.waitUntil(appendAudit(c.env, projectId, user.userId, "label.submit", "item", body.item_id, { label: body.label, phase }));
  c.executionCtx.waitUntil(fireProjectWebhooks(c.env, projectId, "label.submitted", { item_id: body.item_id, label: body.label }));
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
  const [item, my, llm] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM data_items WHERE project_id=? AND item_id=?").bind(c.req.param("id"), itemId).first<any>(),
    c.env.DB.prepare("SELECT label FROM manual_labels WHERE project_id=? AND user_id=? AND item_id=? ORDER BY updated_at DESC LIMIT 1").bind(c.req.param("id"), user.userId, itemId).first<any>(),
    c.env.DB.prepare("SELECT accepted_label,predicted_label FROM llm_labels WHERE project_id=? AND item_id=? ORDER BY created_at DESC LIMIT 1").bind(c.req.param("id"), itemId).first<any>()
  ]);
  return json(c, { item, my_label: my?.label ?? null, llm_label: llm?.accepted_label ?? llm?.predicted_label ?? null });
});

app.get("/api/projects/:id/labeling/item/:itemId/comparison", async (c) => {
  const user = getUser(c);
  const data = await c.env.DB.prepare(
    `SELECT ml.label AS manual_label, ll.accepted_label, ll.predicted_label, ll.confidence, ll.reasoning, ll.raw_json
     FROM manual_labels ml
     LEFT JOIN llm_labels ll
       ON ll.project_id=ml.project_id
      AND ll.item_id=ml.item_id
      AND ll.rowid = (
        SELECT rowid FROM llm_labels
        WHERE project_id=ml.project_id AND item_id=ml.item_id
        ORDER BY created_at DESC LIMIT 1
      )
     WHERE ml.project_id=? AND ml.item_id=? AND ml.user_id=?
     ORDER BY ml.updated_at DESC
     LIMIT 1`
  ).bind(c.req.param("id"), c.req.param("itemId"), user.userId).first<any>();
  return json(c, { comparison: data ?? null });
});

app.post("/api/projects/:id/llm/run", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json<any>();
  const mode = (body.mode ?? "prompt1") as "prompt1" | "prompt2" | "custom";
  if (mode === "custom") {
    const count = await consumeCustomPromptQuota(c.env, projectId, body.item_id);
    if (count === null) {
      return json(c, { error: "custom_limit_exceeded", max: CUSTOM_PROMPT_MAX }, 429);
    }
  }
  const item = await c.env.DB.prepare("SELECT content_text FROM data_items WHERE project_id=? AND item_id=?").bind(projectId, body.item_id).first<any>();
  if (!item) return json(c, { error: "item_not_found" }, 404);
  const scheme = await getActiveScheme(c.env, projectId);
  const prompts = await c.env.DB.prepare("SELECT prompt_key,prompt_text FROM prompts WHERE project_id=?").bind(projectId).all<any>();
  const pMap = Object.fromEntries((prompts.results ?? []).map((p: any) => [p.prompt_key, p.prompt_text]));
  const prompt = mode === "custom" ? (body.custom_prompt_text ?? "") : (pMap[mode] ?? "");
  const fewRows = await c.env.DB.prepare(
    "SELECT fs.item_id, fs.example_label, fs.note, di.content_text FROM project_few_shot fs LEFT JOIN data_items di ON di.item_id=fs.item_id WHERE fs.project_id=? ORDER BY fs.sort_order LIMIT 8"
  ).bind(projectId).all<any>();
  const fewShotBlock = (fewRows.results ?? [])
    .map((r: any) => `Label ${r.example_label}: ${String(r.content_text ?? "").slice(0, 400)}${r.note ? ` (${r.note})` : ""}`)
    .join("\n");
  const out = await runLlmWithFallback(c.env, {
    text: item.content_text,
    labels: (scheme.labels ?? []).map((x: any) => x.code),
    prompt,
    mode,
    fewShotBlock: fewShotBlock || undefined
  });
  const rawPayload = JSON.stringify({ raw: out.raw, confidence: out.confidence, reasoning: out.reasoning });
  await c.env.DB.prepare(
    "INSERT INTO llm_labels(project_id,item_id,phase,mode,predicted_label,accepted_label,accepted_by,raw_json,model,created_at,confidence,reasoning) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,item_id,phase,mode) DO UPDATE SET predicted_label=excluded.predicted_label, raw_json=excluded.raw_json, model=excluded.model, created_at=excluded.created_at, confidence=excluded.confidence, reasoning=excluded.reasoning"
  ).bind(projectId, body.item_id, body.phase ?? "normal", mode, out.label, null, null, rawPayload, out.model, nowIso(), out.confidence, out.reasoning).run();
  return json(c, {
    predicted_label: out.label,
    provider: out.provider,
    model: out.model,
    raw_text: out.raw,
    confidence: out.confidence,
    reasoning: out.reasoning
  });
});

app.post("/api/projects/:id/llm/run-batch", async (c) => {
  const body = await c.req.json<any>();
  const projectId = c.req.param("id");
  const items = Array.isArray(body.item_ids) ? body.item_ids : [];
  const mode = (body.mode ?? "prompt1") as "prompt1" | "prompt2" | "custom";
  const scheme = await getActiveScheme(c.env, projectId);
  const prompts = await c.env.DB.prepare("SELECT prompt_key,prompt_text FROM prompts WHERE project_id=?").bind(projectId).all<any>();
  const pMap = Object.fromEntries((prompts.results ?? []).map((p: any) => [p.prompt_key, p.prompt_text]));
  const prompt = mode === "custom" ? (body.custom_prompt_text ?? "") : (pMap[mode] ?? "");
  const fewRows = await c.env.DB.prepare(
    "SELECT fs.item_id, fs.example_label, fs.note, di.content_text FROM project_few_shot fs LEFT JOIN data_items di ON di.item_id=fs.item_id WHERE fs.project_id=? ORDER BY fs.sort_order LIMIT 8"
  ).bind(projectId).all<any>();
  const fewShotBlock = (fewRows.results ?? [])
    .map((r: any) => `Label ${r.example_label}: ${String(r.content_text ?? "").slice(0, 400)}${r.note ? ` (${r.note})` : ""}`)
    .join("\n");
  const batchSize = 5;
  const results: Array<any> = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(chunk.map(async (itemId: string) => {
      if (mode === "custom") {
        const count = await consumeCustomPromptQuota(c.env, projectId, itemId);
        if (count === null) return { item_id: itemId, error: "custom_limit_exceeded" };
      }
      const item = await c.env.DB.prepare("SELECT content_text FROM data_items WHERE project_id=? AND item_id=?").bind(projectId, itemId).first<any>();
      if (!item) return { item_id: itemId, error: "item_not_found" };
      const out = await runLlmWithFallback(c.env, {
        text: item.content_text,
        labels: (scheme.labels ?? []).map((x: any) => x.code),
        prompt,
        mode,
        fewShotBlock: fewShotBlock || undefined
      });
      const rawPayload = JSON.stringify({ raw: out.raw, confidence: out.confidence, reasoning: out.reasoning });
      await c.env.DB.prepare(
        "INSERT INTO llm_labels(project_id,item_id,phase,mode,predicted_label,accepted_label,accepted_by,raw_json,model,created_at,confidence,reasoning) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,item_id,phase,mode) DO UPDATE SET predicted_label=excluded.predicted_label, raw_json=excluded.raw_json, model=excluded.model, created_at=excluded.created_at, confidence=excluded.confidence, reasoning=excluded.reasoning"
      ).bind(projectId, itemId, body.phase ?? "normal", mode, out.label, null, null, rawPayload, out.model, nowIso(), out.confidence, out.reasoning).run();
      return { item_id: itemId, predicted_label: out.label, provider: out.provider, model: out.model, confidence: out.confidence };
    }));
    for (const one of settled) {
      if (one.status === "fulfilled") {
        results.push(one.value);
      } else {
        results.push({ error: one.reason instanceof Error ? one.reason.message : String(one.reason) });
      }
    }
  }
  const failed = results.filter((r) => !!r.error).length;
  return json(c, { results, summary: { total: items.length, success: items.length - failed, failed } });
});

app.post("/api/projects/:id/llm/accept", async (c) => {
  const body = await readJsonBody<any>(c);
  if (!body) return json(c, { error: "invalid_json" }, 400);
  const missing = requireFields(body, ["item_id", "accepted_label"]);
  if (missing) return json(c, { error: "missing_field", field: missing }, 400);
  const user = getUser(c);
  const run = await c.env.DB.prepare("UPDATE llm_labels SET accepted_label=?, accepted_by=? WHERE project_id=? AND item_id=? AND phase=? AND mode=?")
    .bind(body.accepted_label, user.userId, c.req.param("id"), body.item_id, body.phase ?? "normal", body.mode ?? "prompt1").run();
  if ((run.meta?.changes ?? 0) === 0) return json(c, { error: "llm_label_not_found" }, 404);
  return json(c, { ok: true });
});

app.get("/api/projects/:id/llm/custom/count", async (c) => {
  const itemId = c.req.query("item_id");
  if (!itemId) return json(c, { error: "item_id required" }, 400);
  const count = await getCustomPromptCount(c.env, c.req.param("id"), itemId);
  return json(c, { count, max: CUSTOM_PROMPT_MAX, exhausted: count >= CUSTOM_PROMPT_MAX });
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

// ── V3: AI codebook, few-shot, presence, audit, webhooks, spans, analytics ──
app.post("/api/projects/:id/ai/suggest-codebook", async (c) => {
  const projectId = c.req.param("id");
  const body = await readJsonBody<{ sample_limit?: number }>(c);
  const limit = Math.min(100, Math.max(5, Number(body?.sample_limit ?? 50)));
  const rows = await c.env.DB.prepare("SELECT content_text FROM data_items WHERE project_id=? ORDER BY ordering LIMIT ?").bind(projectId, limit).all<{ content_text: string }>();
  const samples = (rows.results ?? []).map((r) => r.content_text).filter(Boolean);
  if (samples.length === 0) return json(c, { error: "no_data_items" }, 400);
  const suggested = await suggestCodebookFromSamples(c.env, samples.slice(0, 12));
  return json(c, { labels: suggested.labels, raw: suggested.raw });
});

app.get("/api/projects/:id/few-shot", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM project_few_shot WHERE project_id=? ORDER BY sort_order").bind(c.req.param("id")).all();
  return json(c, { examples: rows.results ?? [] });
});

app.post("/api/projects/:id/few-shot", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const body = await readJsonBody<{ examples?: Array<{ item_id: string; example_label: string; note?: string }> }>(c);
  if (!body?.examples || !Array.isArray(body.examples)) return json(c, { error: "examples required" }, 400);
  await c.env.DB.prepare("DELETE FROM project_few_shot WHERE project_id=?").bind(projectId).run();
  const stmts: D1PreparedStatement[] = [];
  let order = 0;
  for (const ex of body.examples.slice(0, 20)) {
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO project_few_shot(id,project_id,item_id,example_label,note,sort_order,created_at) VALUES(?,?,?,?,?,?,?)"
      ).bind(uid("fs_"), projectId, ex.item_id, ex.example_label, ex.note ?? "", order++, nowIso())
    );
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  await appendAudit(c.env, projectId, user.userId, "few_shot.update", "project", projectId, { count: stmts.length });
  return json(c, { ok: true, count: stmts.length });
});

app.post("/api/projects/:id/presence", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const body = await readJsonBody<{ item_id?: string | null }>(c);
  await c.env.DB.prepare(
    "INSERT INTO presence_sessions(project_id,user_id,item_id,last_seen_at) VALUES(?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET item_id=excluded.item_id, last_seen_at=excluded.last_seen_at"
  ).bind(projectId, user.userId, body?.item_id ?? null, nowIso()).run();
  return json(c, { ok: true });
});

app.get("/api/projects/:id/presence", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT ps.user_id, ps.item_id, ps.last_seen_at, u.display_name, u.email FROM presence_sessions ps LEFT JOIN users u ON u.user_id=ps.user_id WHERE ps.project_id=? AND ps.last_seen_at > datetime('now', '-2 minutes')"
  ).bind(c.req.param("id")).all();
  return json(c, { online: rows.results ?? [] });
});

app.get("/api/projects/:id/audit-log", async (c) => {
  const user = getUser(c);
  const member = await c.env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?")
    .bind(c.req.param("id"), user.userId).first<{ role: string }>();
  if (!member || (member.role !== "owner" && member.role !== "admin")) return json(c, { error: "forbidden" }, 403);
  const rows = await c.env.DB.prepare("SELECT * FROM audit_log WHERE project_id=? ORDER BY created_at DESC LIMIT 500").bind(c.req.param("id")).all();
  return json(c, { entries: rows.results ?? [] });
});

app.get("/api/projects/:id/webhooks", async (c) => {
  const user = getUser(c);
  const member = await c.env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?")
    .bind(c.req.param("id"), user.userId).first<{ role: string }>();
  if (!member || (member.role !== "owner" && member.role !== "admin")) return json(c, { error: "forbidden" }, 403);
  const rows = await c.env.DB.prepare("SELECT webhook_id, url, events_json, enabled, created_at FROM project_webhooks WHERE project_id=?").bind(c.req.param("id")).all();
  return json(c, { webhooks: rows.results ?? [] });
});

app.post("/api/projects/:id/webhooks", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const member = await c.env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?")
    .bind(projectId, user.userId).first<{ role: string }>();
  if (!member || (member.role !== "owner" && member.role !== "admin")) return json(c, { error: "forbidden" }, 403);
  const body = await readJsonBody<{ url?: string; events?: string[]; secret?: string }>(c);
  if (!body?.url) return json(c, { error: "url required" }, 400);
  const id = uid("wh_");
  await c.env.DB.prepare(
    "INSERT INTO project_webhooks(webhook_id,project_id,url,secret,events_json,enabled,created_at) VALUES(?,?,?,?,?,?,?)"
  ).bind(id, projectId, body.url, body.secret ?? null, JSON.stringify(body.events ?? ["*"]), 1, nowIso()).run();
  await appendAudit(c.env, projectId, user.userId, "webhook.create", "webhook", id, {});
  return json(c, { ok: true, webhook_id: id });
});

app.delete("/api/projects/:id/webhooks/:webhookId", async (c) => {
  const user = getUser(c);
  const member = await c.env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?")
    .bind(c.req.param("id"), user.userId).first<{ role: string }>();
  if (!member || (member.role !== "owner" && member.role !== "admin")) return json(c, { error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM project_webhooks WHERE project_id=? AND webhook_id=?").bind(c.req.param("id"), c.req.param("webhookId")).run();
  return json(c, { ok: true });
});

app.get("/api/projects/:id/span-annotations", async (c) => {
  const itemId = c.req.query("item_id");
  if (!itemId) return json(c, { error: "item_id required" }, 400);
  const rows = await c.env.DB.prepare("SELECT * FROM span_annotations WHERE project_id=? AND item_id=? ORDER BY start_offset")
    .bind(c.req.param("id"), itemId).all();
  return json(c, { spans: rows.results ?? [] });
});

app.post("/api/projects/:id/span-annotations", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const role = await getMemberRole(c.env, projectId, user.userId);
  if (!roleCanLabel(role)) return json(c, { error: "forbidden_role" }, 403);
  const body = await readJsonBody<{ item_id?: string; start_offset?: number; end_offset?: number; label?: string }>(c);
  if (!body?.item_id || body.start_offset == null || body.end_offset == null || !body.label) return json(c, { error: "invalid_body" }, 400);
  const scheme = await getActiveScheme(c.env, projectId);
  const allowed = new Set((scheme.labels ?? []).map((x: any) => String(x.code)));
  if (!allowed.has(String(body.label))) return json(c, { error: "invalid_label" }, 400);
  const id = uid("span_");
  await c.env.DB.prepare(
    "INSERT INTO span_annotations(span_id,project_id,item_id,user_id,start_offset,end_offset,label,scheme_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).bind(id, projectId, body.item_id, user.userId, body.start_offset, body.end_offset, body.label, scheme.version ?? 1, nowIso(), nowIso()).run();
  return json(c, { ok: true, span_id: id });
});

app.post("/api/projects/:id/integrations/survey-import", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const member = await c.env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?")
    .bind(projectId, user.userId).first<{ role: string }>();
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return json(c, { error: "forbidden" }, 403);
  }
  const body = await readJsonBody<{
    provider?: "qualtrics" | "surveymonkey";
    api_token?: string;
    datacenter?: string;
    survey_id?: string;
    text_field?: string;
  }>(c);
  if (!body) return json(c, { error: "invalid_json" }, 400);
  const out = await runSurveyImport(c.env, projectId, user.userId, { ...body, api_token: body.api_token ?? c.env.QUALTRICS_API_TOKEN });
  if (!out.ok) return json(c, out, 400);
  await appendAudit(c.env, projectId, user.userId, "survey_import", "project", projectId, { imported: out.imported, provider: body.provider });
  return json(c, { ok: true, imported: out.imported, provider: body.provider ?? "qualtrics" });
});

app.get("/api/projects/:id/analytics/productivity", async (c) => {
  const projectId = c.req.param("id");
  const perUser = await c.env.DB.prepare(
    "SELECT user_id, COUNT(*) AS labels, AVG(active_ms) AS avg_ms FROM label_attempts WHERE project_id=? AND task='manual' AND is_valid=1 GROUP BY user_id"
  ).bind(projectId).all();
  return json(c, { per_user: perUser.results ?? [] });
});

app.get("/api/projects/:id/analytics/eta", async (c) => {
  const projectId = c.req.param("id");
  const [assign, done] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM assignments WHERE project_id=? AND status='todo'").bind(projectId).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM assignments WHERE project_id=? AND status='done'").bind(projectId).first<any>()
  ]);
  const todo = Number(assign?.n ?? 0);
  const completed = Number(done?.n ?? 0);
  const rateRow = await c.env.DB.prepare(
    "SELECT AVG(active_ms) AS avg_ms FROM label_attempts WHERE project_id=? AND task='manual' AND is_valid=1"
  ).bind(projectId).first<any>();
  const avgMs = Number(rateRow?.avg_ms ?? 60000);
  const etaHours = todo > 0 ? (todo * avgMs) / 3600000 : 0;
  return json(c, { todo_assignments: todo, completed_assignments: completed, estimated_hours_remaining: Math.round(etaHours * 10) / 10 });
});

app.get("/api/projects/:id/analytics/phase-evolution", async (c) => {
  const projectId = c.req.param("id");
  const manual = await c.env.DB.prepare("SELECT phase, label, COUNT(*) AS cnt FROM manual_labels WHERE project_id=? GROUP BY phase, label").bind(projectId).all();
  return json(c, { by_phase: manual.results ?? [] });
});

app.get("/api/projects/:id/irr/drill", async (c) => {
  const projectId = c.req.param("id");
  const kappa = c.req.query("max_kappa");
  const maxK = kappa != null ? Number(kappa) : 0.5;
  const snap = await c.env.DB.prepare("SELECT per_category_json, snapshot_id FROM irr_snapshots WHERE project_id=? ORDER BY calculated_at DESC LIMIT 1")
    .bind(projectId).first<any>();
  const per = parseJsonSafe<Record<string, number>>(snap?.per_category_json, {});
  const low = Object.entries(per).filter(([, v]) => v <= maxK).map(([k]) => k);
  return json(c, { low_agreement_categories: low, snapshot_id: snap?.snapshot_id ?? null });
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
  const existing = await c.env.DB.prepare("SELECT item_id FROM conflicts WHERE project_id=? AND status!='resolved'").bind(projectId).all<{ item_id: string }>();
  const openItemSet = new Set((existing.results ?? []).map((x) => x.item_id));
  const inserts = (rows.results ?? [])
    .filter((row) => !openItemSet.has(row.item_id))
    .map((row) =>
      c.env.DB.prepare(
        "INSERT INTO conflicts(conflict_id,project_id,item_id,labels_json,status,resolved_label,resolved_by,resolution_note,detected_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
      ).bind(uid("conf_"), projectId, row.item_id, row.labels, "open", null, null, null, nowIso(), null)
    );
  if (inserts.length > 0) await c.env.DB.batch(inserts);
  const created = inserts.length;
  if (created > 0) {
    c.executionCtx.waitUntil(notifyConflictDetected(c.env, projectId, created));
    c.executionCtx.waitUntil(fireProjectWebhooks(c.env, projectId, "conflict.detected", { count: created }));
  }
  return json(c, { created });
});
app.post("/api/projects/:id/conflicts/:conflictId/resolve", async (c) => {
  const body = await readJsonBody<any>(c);
  if (!body) return json(c, { error: "invalid_json" }, 400);
  if (!body.resolved_label) return json(c, { error: "missing_field", field: "resolved_label" }, 400);
  const user = getUser(c);
  const [member, conflict] = await Promise.all([
    c.env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?")
      .bind(c.req.param("id"), user.userId).first<{ role: string }>(),
    c.env.DB.prepare("SELECT resolved_by FROM conflicts WHERE project_id=? AND conflict_id=?")
      .bind(c.req.param("id"), c.req.param("conflictId")).first<{ resolved_by: string | null }>()
  ]);
  if (!member) return json(c, { error: "forbidden" }, 403);
  const isPrivileged = member.role === "owner" || member.role === "admin";
  const isDesignatedResolver = conflict?.resolved_by != null && conflict.resolved_by === user.userId;
  const canResolve = isPrivileged || isDesignatedResolver || roleCanResolveConflicts(member.role);
  if (!canResolve) return json(c, { error: "forbidden" }, 403);
  await c.env.DB.prepare("UPDATE conflicts SET status='resolved', resolved_label=?, resolved_by=?, resolution_note=?, resolved_at=? WHERE project_id=? AND conflict_id=?")
    .bind(body.resolved_label, user.userId, body.resolution_note ?? "", nowIso(), c.req.param("id"), c.req.param("conflictId")).run();
  c.executionCtx.waitUntil(appendAudit(c.env, c.req.param("id"), user.userId, "conflict.resolve", "conflict", c.req.param("conflictId"), { label: body.resolved_label }));
  c.executionCtx.waitUntil(fireProjectWebhooks(c.env, c.req.param("id"), "conflict.resolved", { conflict_id: c.req.param("conflictId") }));
  return json(c, { ok: true });
});
app.post("/api/projects/:id/conflicts/:conflictId/reopen", async (c) => {
  const user = getUser(c);
  const [member, conflict] = await Promise.all([
    c.env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?")
      .bind(c.req.param("id"), user.userId).first<{ role: string }>(),
    c.env.DB.prepare("SELECT resolved_by FROM conflicts WHERE project_id=? AND conflict_id=?")
      .bind(c.req.param("id"), c.req.param("conflictId")).first<{ resolved_by: string | null }>()
  ]);
  if (!member) return json(c, { error: "forbidden" }, 403);
  const isPrivileged = member.role === "owner" || member.role === "admin";
  const isDesignatedResolver = conflict?.resolved_by != null && conflict.resolved_by === user.userId;
  const canReopen = isPrivileged || isDesignatedResolver || roleCanResolveConflicts(member.role);
  if (!canReopen) return json(c, { error: "forbidden" }, 403);
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
  const content = String(body.content ?? "");
  await c.env.DB.prepare(
    "INSERT INTO messages(message_id,project_id,item_id,conflict_id,user_id,content,message_type,created_at,parent_message_id) VALUES(?,?,?,?,?,?,?,?,?)"
  ).bind(
    messageId,
    projectId,
    body.item_id ?? null,
    body.conflict_id ?? null,
    user.userId,
    content,
    body.message_type ?? "chat",
    nowIso(),
    body.parent_message_id ?? null
  ).run();
  const mentionRe = /@([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g;
  const mentionedEmails = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = mentionRe.exec(content)) !== null) mentionedEmails.add(m[1].toLowerCase());
  if (mentionedEmails.size > 0) {
    const rows = await c.env.DB.prepare(
      "SELECT u.user_id, u.email FROM project_members pm INNER JOIN users u ON u.user_id=pm.user_id WHERE pm.project_id=?"
    ).bind(projectId).all<{ user_id: string; email: string }>();
    const byEmail = new Map((rows.results ?? []).map((r) => [r.email.toLowerCase(), r.user_id]));
    c.executionCtx.waitUntil(
      Promise.all(
        [...mentionedEmails].map((em) => {
          const uidM = byEmail.get(em);
          if (!uidM || uidM === user.userId) return Promise.resolve();
          return createNotification(c.env, {
            projectId,
            userId: uidM,
            type: "mention",
            title: "You were mentioned",
            body: content.slice(0, 120),
            meta: { message_id: messageId, item_id: body.item_id ?? null }
          });
        })
      )
    );
  }
  const hubId = c.env.CHAT_HUB.idFromName(projectId);
  const msgPayload = JSON.stringify({ message_id: messageId, user_id: user.userId, content, message_type: body.message_type ?? "chat", created_at: nowIso(), item_id: body.item_id ?? null, parent_message_id: body.parent_message_id ?? null });
  c.executionCtx.waitUntil(c.env.CHAT_HUB.get(hubId).fetch("https://chat.internal/broadcast", { method: "POST", body: msgPayload }));
  if (body.message_type !== "system" && body.message_type !== "suggestion") {
    c.executionCtx.waitUntil(notifyNewMessage(c.env, projectId, user.userId, body.message_type === "note" ? "note" : "chat", content, body.item_id));
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
    await c.env.DB.batch(ids.map((id) =>
      c.env.DB.prepare("UPDATE notifications SET is_read=1 WHERE notification_id=? AND user_id=?").bind(id, user.userId)
    ));
  }
  return json(c, { ok: true });
});
app.get("/api/projects/:id/notifications/stream", async (c) => {
  const id = c.env.STATS_HUB.idFromName(`notifications:${c.req.param("id")}`);
  return c.env.STATS_HUB.get(id).fetch("https://stats.internal/ws", c.req.raw);
});

app.get("/api/projects/:id/stats/overview", async (c) => {
  const projectId = c.req.param("id");
  const [items, labels, conflicts, dist] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM data_items WHERE project_id=?").bind(projectId).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM manual_labels WHERE project_id=?").bind(projectId).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM conflicts WHERE project_id=? AND status='open'").bind(projectId).first<any>(),
    c.env.DB.prepare("SELECT label, COUNT(*) AS cnt FROM manual_labels WHERE project_id=? GROUP BY label").bind(projectId).all<any>()
  ]);
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

// ── Survey ─────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/survey/my", async (c) => {
  const user = getUser(c);
  const row = await c.env.DB.prepare("SELECT * FROM survey_responses WHERE project_id=? AND user_id=?")
    .bind(c.req.param("id"), user.userId).first<any>();
  return json(c, { response: row ?? null });
});

app.post("/api/projects/:id/survey/submit", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const body = await c.req.json<any>();
  const responseId = uid("resp_");
  await c.env.DB.prepare(
    "INSERT INTO survey_responses(response_id,project_id,user_id,likert_json,mc_answer,open_q1,open_q2,open_q3,submitted_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET likert_json=excluded.likert_json, mc_answer=excluded.mc_answer, open_q1=excluded.open_q1, open_q2=excluded.open_q2, open_q3=excluded.open_q3, submitted_at=excluded.submitted_at"
  ).bind(responseId, projectId, user.userId, JSON.stringify(body.likert ?? {}), body.mc_answer ?? null, body.open_q1 ?? "", body.open_q2 ?? "", body.open_q3 ?? "", nowIso()).run();
  return json(c, { ok: true });
});

app.get("/api/projects/:id/survey/all", async (c) => {
  const user = getUser(c);
  const member = await c.env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?")
    .bind(c.req.param("id"), user.userId).first<{ role: string }>();
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return json(c, { error: "forbidden" }, 403);
  }
  const rows = await c.env.DB.prepare("SELECT * FROM survey_responses WHERE project_id=? ORDER BY submitted_at DESC")
    .bind(c.req.param("id")).all();
  return json(c, { responses: rows.results ?? [] });
});

// ── Visualization Stats ─────────────────────────────────────────────────────
app.get("/api/projects/:id/viz/stats", async (c) => {
  const projectId = c.req.param("id");
  const user = getUser(c);
  const [manualDist, llmDist, manualTime, llmTime, diffRows] = await Promise.all([
    c.env.DB.prepare(
      "SELECT label, COUNT(*) AS cnt FROM manual_labels WHERE project_id=? AND user_id=? GROUP BY label"
    ).bind(projectId, user.userId).all<any>(),
    c.env.DB.prepare(
      "SELECT COALESCE(accepted_label, predicted_label) AS label, COUNT(*) AS cnt FROM llm_labels WHERE project_id=? GROUP BY label"
    ).bind(projectId).all<any>(),
    c.env.DB.prepare(
      "SELECT AVG(active_ms) AS avg_ms FROM label_attempts WHERE project_id=? AND user_id=? AND task='manual' AND is_valid=1"
    ).bind(projectId, user.userId).first<any>(),
    c.env.DB.prepare(
      "SELECT AVG(active_ms) AS avg_ms FROM label_attempts WHERE project_id=? AND user_id=? AND task='llm' AND is_valid=1"
    ).bind(projectId, user.userId).first<any>(),
    c.env.DB.prepare(
      "SELECT ml.item_id, ml.label AS manual_label, COALESCE(ll.accepted_label, ll.predicted_label) AS llm_label, di.content_text AS text FROM manual_labels ml LEFT JOIN llm_labels ll ON ll.project_id=ml.project_id AND ll.item_id=ml.item_id LEFT JOIN data_items di ON di.project_id=ml.project_id AND di.item_id=ml.item_id WHERE ml.project_id=? AND ml.user_id=? ORDER BY di.ordering LIMIT 200"
    ).bind(projectId, user.userId).all<any>()
  ]);

  const manualDistMap: Record<string, number> = {};
  for (const r of manualDist.results ?? []) manualDistMap[r.label] = Number(r.cnt ?? 0);
  const llmDistMap: Record<string, number> = {};
  for (const r of llmDist.results ?? []) if (r.label) llmDistMap[r.label] = Number(r.cnt ?? 0);

  const totalManual = Number(manualTime?.avg_ms ?? 0);
  const totalLlm = Number(llmTime?.avg_ms ?? 0);

  return json(c, {
    label_distribution: { manual: manualDistMap, llm: llmDistMap },
    time_comparison: {
      manual_avg_ms: Math.round(totalManual),
      llm_avg_ms: Math.round(totalLlm),
      saved_pct: totalManual > 0 && totalLlm > 0 ? Math.round((1 - totalLlm / totalManual) * 100) : null
    },
    label_diff: (diffRows.results ?? []).map((r) => ({
      item_id: r.item_id,
      text: (r.text ?? "").slice(0, 200),
      manual_label: r.manual_label,
      llm_label: r.llm_label,
      diff: r.manual_label !== r.llm_label
    })).filter((r) => r.llm_label != null),
    total_items: (manualDist.results ?? []).reduce((s, r) => s + Number(r.cnt ?? 0), 0)
  });
});

app.get("/api/projects/:id/viz/llm-confidence", async (c) => {
  const projectId = c.req.param("id");
  const rows = await c.env.DB.prepare(
    `SELECT ll.item_id,
            COALESCE(ll.accepted_label, ll.predicted_label) AS effective_label,
            ll.predicted_label,
            ll.confidence,
            di.content_text AS text
     FROM llm_labels ll
     LEFT JOIN data_items di ON di.project_id = ll.project_id AND di.item_id = ll.item_id
     WHERE ll.project_id = ? AND ll.confidence IS NOT NULL
     ORDER BY ll.confidence ASC
     LIMIT 800`
  )
    .bind(projectId)
    .all<{ item_id: string; effective_label: string; predicted_label: string; confidence: number; text: string }>();
  return json(c, { points: rows.results ?? [] });
});

// ── Export ──────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/export", async (c) => {
  const projectId = c.req.param("id");
  const format = c.req.query("format") ?? "json";
  const limit = parseLimit(c.req.query("limit"), 1000, 5000);
  const cursor = Number(c.req.query("cursor") ?? 0);
  const [projects, members, dataItems, manualLabels, llmLabels, conflicts, irr, messages, attempts] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM projects WHERE project_id=?").bind(projectId).all(),
    c.env.DB.prepare("SELECT * FROM project_members WHERE project_id=?").bind(projectId).all(),
    c.env.DB.prepare("SELECT rowid,* FROM data_items WHERE project_id=? AND rowid>? ORDER BY rowid LIMIT ?").bind(projectId, cursor, limit).all(),
    c.env.DB.prepare("SELECT rowid,* FROM manual_labels WHERE project_id=? AND rowid>? ORDER BY rowid LIMIT ?").bind(projectId, cursor, limit).all(),
    c.env.DB.prepare("SELECT rowid,* FROM llm_labels WHERE project_id=? AND rowid>? ORDER BY rowid LIMIT ?").bind(projectId, cursor, limit).all(),
    c.env.DB.prepare("SELECT rowid,* FROM conflicts WHERE project_id=? AND rowid>? ORDER BY rowid LIMIT ?").bind(projectId, cursor, limit).all(),
    c.env.DB.prepare("SELECT rowid,* FROM irr_snapshots WHERE project_id=? AND rowid>? ORDER BY rowid LIMIT ?").bind(projectId, cursor, limit).all(),
    c.env.DB.prepare("SELECT rowid,* FROM messages WHERE project_id=? AND rowid>? ORDER BY rowid LIMIT ?").bind(projectId, cursor, limit).all(),
    c.env.DB.prepare("SELECT rowid,* FROM label_attempts WHERE project_id=? AND rowid>? ORDER BY rowid LIMIT ?").bind(projectId, cursor, limit).all()
  ]);
  const dataItemsRows = (dataItems.results ?? []) as Array<any>;
  const manualLabelsRows = (manualLabels.results ?? []) as Array<any>;
  const llmLabelsRows = (llmLabels.results ?? []) as Array<any>;
  const conflictsRows = (conflicts.results ?? []) as Array<any>;
  const irrRows = (irr.results ?? []) as Array<any>;
  const messagesRows = (messages.results ?? []) as Array<any>;
  const attemptsRows = (attempts.results ?? []) as Array<any>;
  const paging = computePagingFromRows(cursor, limit, [
    dataItemsRows,
    manualLabelsRows,
    llmLabelsRows,
    conflictsRows,
    irrRows,
    messagesRows,
    attemptsRows
  ]);
  const payload = {
    projects: projects.results ?? [],
    members: members.results ?? [],
    data_items: dataItemsRows.map(({ rowid, ...r }) => r),
    manual_labels: manualLabelsRows.map(({ rowid, ...r }) => r),
    llm_labels: llmLabelsRows.map(({ rowid, ...r }) => r),
    conflicts: conflictsRows.map(({ rowid, ...r }) => r),
    irr: irrRows.map(({ rowid, ...r }) => r),
    messages: messagesRows.map(({ rowid, ...r }) => r),
    attempts: attemptsRows.map(({ rowid, ...r }) => r),
    paging: { cursor, limit, next_cursor: paging.nextCursor, has_more: paging.hasMore }
  };
  if (format === "json") return json(c, payload);
  if (format === "jsonl" || format === "jsonlines") {
    const strip = (r: any) => {
      const { rowid: _r, ...rest } = r;
      return rest;
    };
    const lines = [
      ...manualLabelsRows.map((r: any) => JSON.stringify({ type: "manual_label", ...strip(r) })),
      ...llmLabelsRows.map((r: any) => JSON.stringify({ type: "llm_label", ...strip(r) }))
    ].join("\n");
    return new Response(lines, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="${projectId}.jsonl"`
      }
    });
  }
  if (format === "refi-qda") {
    const scheme = await getActiveScheme(c.env, projectId);
    const codes = (scheme.labels ?? []) as Array<{ code: string; description?: string; parent_code?: string }>;
    const xml = buildRefiQdaXml(
      String((projects.results?.[0] as any)?.name ?? projectId),
      projectId,
      dataItemsRows.map(({ rowid: _r, ...di }: any) => ({ item_id: di.item_id, content_text: di.content_text })),
      manualLabelsRows.map(({ rowid: _r, ...ml }: any) => ({
        item_id: ml.item_id,
        user_id: ml.user_id,
        label: ml.label
      })),
      codes
    );
    return new Response(xml, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="${projectId}-refi.xml"`
      }
    });
  }
  if (format === "parquet" || format === "parquet-zstd") {
    const strip = (r: any) => {
      const { rowid: _rowid, ...rest } = r;
      return rest;
    };
    const labelRows = [
      ...manualLabelsRows.map((r: any) => normalizeExportRow({ label_kind: "manual", ...strip(r) })),
      ...llmLabelsRows.map((r: any) => normalizeExportRow({ label_kind: "llm", ...strip(r) }))
    ];
    const comp =
      format === "parquet-zstd" || c.req.query("compression") === "zstd" ? "zstd" : "snappy";
    const bytes = buildLabelsParquetBytes(labelRows, comp);
    return new Response(bytes, {
      headers: {
        "content-type": "application/vnd.apache.parquet",
        "content-disposition": `attachment; filename="${projectId}-labels.parquet"`
      }
    });
  }
  if (format === "arrow" || format === "ipc") {
    const strip = (r: any) => {
      const { rowid: _rowid, ...rest } = r;
      return rest;
    };
    const labelRows = [
      ...manualLabelsRows.map((r: any) => normalizeExportRow({ label_kind: "manual", ...strip(r) })),
      ...llmLabelsRows.map((r: any) => normalizeExportRow({ label_kind: "llm", ...strip(r) }))
    ];
    const bytes = buildLabelsArrowIpcBytes(labelRows);
    return new Response(bytes, {
      headers: {
        "content-type": "application/vnd.apache.arrow.stream",
        "content-disposition": `attachment; filename="${projectId}-labels.arrow"`
      }
    });
  }
  const text = JSON.stringify(payload, null, 2);
  return new Response(text, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${projectId}.${format}"` } });
});

export { StatsHub, QwenRateLimiter, AlRunner, ChatHub };
export const __test_helpers = { parseLimit, requireFields, validateLabelingSubmission, computePagingFromRows, consumeCustomPromptQuota };

export default {
  fetch: app.fetch.bind(app),
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    try {
      const r = await backupAllD1TablesToR2(env);
      console.log("d1 backup ok", r.prefix, "tables=", r.tableCount, "cron=", event.cron ?? "");
    } catch (e) {
      console.error("scheduled backup", e);
    }
  }
};
