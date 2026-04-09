-- Performance indexes and custom LLM quota table

CREATE TABLE IF NOT EXISTS llm_run_counts (
  project_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_project_user_status
  ON assignments(project_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_manual_labels_project_item
  ON manual_labels(project_id, item_id);

CREATE INDEX IF NOT EXISTS idx_llm_labels_item
  ON llm_labels(project_id, item_id, phase);

CREATE INDEX IF NOT EXISTS idx_interaction_events_attempt_created
  ON interaction_events(attempt_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conflicts_project_status
  ON conflicts(project_id, status);

CREATE INDEX IF NOT EXISTS idx_irr_snapshots_project_created
  ON irr_snapshots(project_id, calculated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_project_user
  ON survey_responses(project_id, user_id);
