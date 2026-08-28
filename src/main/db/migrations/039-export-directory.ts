export const MIGRATION_039_EXPORT_DIRECTORY = `
ALTER TABLE projects ADD COLUMN export_directory TEXT;

CREATE TABLE IF NOT EXISTS export_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  edition_id TEXT,
  chapter_id TEXT,
  format TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_export_history_project_created
  ON export_history(project_id, created_at DESC);
`;
