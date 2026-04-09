-- V3: span annotations, audit, webhooks, LLM extras, message threads, presence, rate buckets

ALTER TABLE llm_labels ADD COLUMN confidence REAL;
ALTER TABLE llm_labels ADD COLUMN reasoning TEXT;

ALTER TABLE messages ADD COLUMN parent_message_id TEXT;

CREATE TABLE IF NOT EXISTS span_annotations (
  span_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  label TEXT NOT NULL,
  scheme_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_span_project_item ON span_annotations(project_id, item_id);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_log(project_id, created_at);

CREATE TABLE IF NOT EXISTS project_webhooks (
  webhook_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  url TEXT NOT NULL,
  secret TEXT,
  events_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhooks_project ON project_webhooks(project_id);

CREATE TABLE IF NOT EXISTS presence_sessions (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS api_rate_buckets (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_few_shot (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  item_id TEXT NOT NULL,
  example_label TEXT NOT NULL,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_few_shot_project ON project_few_shot(project_id);
