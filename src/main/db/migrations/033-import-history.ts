export const MIGRATION_033_IMPORT_HISTORY = `
CREATE TABLE IF NOT EXISTS import_history (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  edition_id TEXT,
  data_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'committed',
  undo_entries_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_import_history_project_created
  ON import_history(project_id, created_at DESC);
`;
