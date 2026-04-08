INSERT OR IGNORE INTO config(project_id, key, value, updated_at) VALUES
  ('global', 'irr_auto_check_interval', '20', datetime('now')),
  ('global', 'irr_low_threshold', '0.3', datetime('now'));
