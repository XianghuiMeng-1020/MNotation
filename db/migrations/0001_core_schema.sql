CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  last_active_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id TEXT NOT NULL REFERENCES users(user_id),
  data_type TEXT NOT NULL DEFAULT 'generic',
  granularity TEXT NOT NULL DEFAULT 'item',
  sampling_method TEXT NOT NULL DEFAULT 'random',
  coding_method TEXT NOT NULL DEFAULT 'both',
  settings_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  role TEXT NOT NULL DEFAULT 'coder',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS datasets (
  dataset_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  filename TEXT NOT NULL,
  file_format TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  chunk_config_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'uploaded',
  error_message TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(user_id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_items (
  item_id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(dataset_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  ordering INTEGER NOT NULL,
  content_text TEXT NOT NULL,
  context_json TEXT DEFAULT '{}',
  meta_json TEXT DEFAULT '{}',
  source_row INTEGER,
  chunk_index INTEGER,
  parent_doc_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_data_items_project ON data_items(project_id, ordering);
CREATE INDEX IF NOT EXISTS idx_data_items_dataset ON data_items(dataset_id);

CREATE TABLE IF NOT EXISTS coding_schemes (
  scheme_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  version INTEGER NOT NULL DEFAULT 1,
  labels_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(user_id),
  change_note TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coding_schemes_project ON coding_schemes(project_id, version);

CREATE TABLE IF NOT EXISTS assignments (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'normal',
  task TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'todo',
  ordering INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id, item_id, phase, task)
);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id, project_id, status);

CREATE TABLE IF NOT EXISTS manual_labels (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'normal',
  label TEXT NOT NULL,
  scheme_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id, item_id, phase)
);
CREATE INDEX IF NOT EXISTS idx_manual_labels_item ON manual_labels(project_id, item_id);

CREATE TABLE IF NOT EXISTS llm_labels (
  project_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'normal',
  mode TEXT NOT NULL,
  predicted_label TEXT NOT NULL,
  accepted_label TEXT,
  accepted_by TEXT,
  raw_json TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, item_id, phase, mode)
);

CREATE TABLE IF NOT EXISTS label_attempts (
  attempt_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  task TEXT NOT NULL,
  llm_mode TEXT,
  selected_option TEXT,
  display_at_epoch_ms INTEGER,
  answer_at_epoch_ms INTEGER,
  active_ms INTEGER,
  hidden_ms INTEGER,
  idle_ms INTEGER,
  hidden_count INTEGER DEFAULT 0,
  blur_count INTEGER DEFAULT 0,
  is_valid INTEGER DEFAULT 1,
  invalid_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_project ON label_attempts(project_id, user_id);

CREATE TABLE IF NOT EXISTS interaction_events (
  event_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  t_perf_ms REAL,
  t_epoch_ms INTEGER,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_attempt ON interaction_events(attempt_id);

CREATE TABLE IF NOT EXISTS al_scores (
  project_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  score REAL NOT NULL,
  reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, item_id)
);

CREATE TABLE IF NOT EXISTS al_runs (
  run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  detail_json TEXT
);

CREATE TABLE IF NOT EXISTS conflicts (
  conflict_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  labels_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_label TEXT,
  resolved_by TEXT,
  resolution_note TEXT,
  detected_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_conflicts_project ON conflicts(project_id, status);
CREATE INDEX IF NOT EXISTS idx_conflicts_item ON conflicts(project_id, item_id);

CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  item_id TEXT,
  conflict_id TEXT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'chat',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  meta_json TEXT DEFAULT '{}',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS prompts (
  project_id TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, prompt_key)
);

CREATE TABLE IF NOT EXISTS irr_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  calculated_at TEXT NOT NULL,
  total_items INTEGER NOT NULL,
  overlapping_items INTEGER NOT NULL,
  cohens_kappa REAL,
  fleiss_kappa REAL,
  krippendorffs_alpha REAL,
  percent_agreement REAL,
  per_category_json TEXT,
  rater_pair_json TEXT,
  confusion_matrix_json TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_irr_project ON irr_snapshots(project_id, calculated_at);

CREATE TABLE IF NOT EXISTS config (
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, key)
);

CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  user_id TEXT,
  page_path TEXT NOT NULL,
  entered_at_epoch_ms INTEGER,
  left_at_epoch_ms INTEGER
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_end INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  response_json TEXT,
  response_status INTEGER,
  created_at TEXT NOT NULL
);
