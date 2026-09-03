/** Fiction series / universe + volume membership (Prompt 15). */
export const MIGRATION_053_FICTION_SERIES = `
CREATE TABLE IF NOT EXISTS fiction_series (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  genre TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS fiction_series_volumes (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  volume_order INTEGER NOT NULL DEFAULT 0,
  volume_label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (series_id) REFERENCES fiction_series(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE (series_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_fiction_series_volumes_series
  ON fiction_series_volumes(series_id, volume_order);

CREATE INDEX IF NOT EXISTS idx_fiction_series_volumes_project
  ON fiction_series_volumes(project_id);

CREATE TABLE IF NOT EXISTS series_style_rules (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  rule_kind TEXT NOT NULL DEFAULT 'style',
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (series_id) REFERENCES fiction_series(id)
);

CREATE INDEX IF NOT EXISTS idx_series_style_rules_series
  ON series_style_rules(series_id, sort_order);

CREATE TABLE IF NOT EXISTS series_world_states (
  series_id TEXT PRIMARY KEY,
  world_knowledge_json TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (series_id) REFERENCES fiction_series(id)
);
`;
