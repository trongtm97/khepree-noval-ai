/**
 * Translation Notebook source ownership + Drive LIVE bindings.
 * Prefer Google Docs live links over static file/text uploads.
 */
export const MIGRATION_024_NOTEBOOK_SOURCE_BINDINGS = `
ALTER TABLE drive_resources ADD COLUMN mime_type TEXT;

ALTER TABLE knowledge_files ADD COLUMN drive_file_id TEXT;
ALTER TABLE knowledge_files ADD COLUMN mime_type TEXT;

CREATE TABLE IF NOT EXISTS notebook_source_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  notebook_id TEXT,
  knowledge_type TEXT NOT NULL,
  drive_file_id TEXT,
  source_name TEXT NOT NULL,
  binding_type TEXT NOT NULL,
  content_hash TEXT,
  local_version INTEGER NOT NULL DEFAULT 0,
  remote_version INTEGER NOT NULL DEFAULT 0,
  last_verified_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, notebook_id, knowledge_type)
);

CREATE INDEX IF NOT EXISTS idx_notebook_source_bindings_project
  ON notebook_source_bindings(project_id);

CREATE INDEX IF NOT EXISTS idx_notebook_source_bindings_status
  ON notebook_source_bindings(project_id, status);

CREATE INDEX IF NOT EXISTS idx_notebook_source_bindings_drive
  ON notebook_source_bindings(drive_file_id);
`;
