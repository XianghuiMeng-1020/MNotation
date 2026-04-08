import type { Env } from "./types";
import { nowIso, parseJsonSafe, uid } from "./utils";

export async function assertProjectMember(env: Env, projectId: string, userId: string) {
  const row = await env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?").bind(projectId, userId).first<{ role: string }>();
  return row;
}

export async function createProject(env: Env, input: any, ownerId: string) {
  const projectId = uid("prj_");
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO projects(project_id,name,description,owner_id,data_type,granularity,sampling_method,coding_method,settings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      projectId,
      input.name ?? "Untitled Project",
      input.description ?? "",
      ownerId,
      input.data_type ?? "generic",
      input.granularity ?? "row_per_item",
      input.sampling_method ?? "random",
      input.coding_method ?? "both",
      JSON.stringify({ enable_ranking: true, enable_label_comparison: true }),
      now,
      now
    ),
    env.DB.prepare("INSERT INTO project_members(project_id,user_id,role,joined_at) VALUES(?,?,?,?)").bind(projectId, ownerId, "owner", now),
    env.DB.prepare("INSERT INTO prompts(project_id,prompt_key,prompt_text,version,updated_at) VALUES(?,?,?,?,?)").bind(projectId, "prompt1", "Classify the text into one code and output JSON {\"label\":\"CODE\"}.", 1, now),
    env.DB.prepare("INSERT INTO prompts(project_id,prompt_key,prompt_text,version,updated_at) VALUES(?,?,?,?,?)").bind(projectId, "prompt2", "Classify with a different few-shot strategy and output JSON {\"label\":\"CODE\"}.", 1, now)
  ]);
  if (Array.isArray(input.coding_scheme) && input.coding_scheme.length > 0) {
    await env.DB.prepare(
      "INSERT INTO coding_schemes(scheme_id,project_id,version,labels_json,created_by,change_note,is_active,created_at) VALUES(?,?,?,?,?,?,?,?)"
    ).bind(uid("scheme_"), projectId, 1, JSON.stringify(input.coding_scheme), ownerId, "Initial scheme", 1, now).run();
  }
  return projectId;
}

export async function getActiveScheme(env: Env, projectId: string) {
  const row = await env.DB.prepare("SELECT * FROM coding_schemes WHERE project_id=? AND is_active=1 ORDER BY version DESC LIMIT 1").bind(projectId).first<any>();
  if (!row) return { version: 1, labels: [] };
  return { version: row.version, labels: parseJsonSafe(row.labels_json, []) };
}
