import type { Env } from "./types";

const SAFE_TABLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Export every user table in D1 as one JSONL object per row under R2.
 * Safe for scheduled cron (no full binary dump; portable restore path is JSONL → import scripts).
 */
export async function backupAllD1TablesToR2(env: Env): Promise<{ prefix: string; tableCount: number }> {
  const iso = new Date().toISOString();
  const folderTs = iso.replace(/[:.]/g, "-");
  const prefix = `system/backups/d1/${folderTs}`;

  const listed = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  ).all<{ name: string }>();

  const names = (listed.results ?? []).map((r) => r.name).filter((n) => SAFE_TABLE.test(n));
  let tableCount = 0;

  for (const name of names) {
    const q = `SELECT * FROM "${name.replace(/"/g, '""')}"`;
    const data = await env.DB.prepare(q).all<Record<string, unknown>>();
    const lines = (data.results ?? []).map((r) => JSON.stringify(r));
    const body = lines.length ? `${lines.join("\n")}\n` : "";
    await env.UPLOADS.put(`${prefix}/${name}.jsonl`, body, {
      httpMetadata: { contentType: "application/x-ndjson; charset=utf-8" }
    });
    tableCount++;
  }

  const meta = {
    exported_at: iso,
    table_count: tableCount,
    tables: names
  };
  await env.UPLOADS.put(`${prefix}/_meta.json`, JSON.stringify(meta, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });

  await env.UPLOADS.put(
    "system/backups/latest.txt",
    `${prefix}/`,
    { httpMetadata: { contentType: "text/plain; charset=utf-8" } }
  );

  return { prefix: `${prefix}/`, tableCount };
}
