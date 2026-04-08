-- Survey responses per project per user
CREATE TABLE IF NOT EXISTS survey_responses (
  response_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  likert_json TEXT NOT NULL DEFAULT '{}',   -- { questionKey: 1-5, ... }
  mc_answer TEXT,                            -- multiple choice answer key
  open_q1 TEXT DEFAULT '',
  open_q2 TEXT DEFAULT '',
  open_q3 TEXT DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_project ON survey_responses(project_id);
