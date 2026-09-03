export const MIGRATION_044_BATCH_IMPORT = `
-- Idempotent multi-novel batch import sessions + project source identity

ALTER TABLE projects ADD COLUMN source_content_fingerprint TEXT;
ALTER TABLE projects ADD COLUMN source_identity_key TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_source_identity
  ON projects(source_identity_key)
  WHERE source_identity_key IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_source_fingerprint
  ON projects(source_content_fingerprint)
  WHERE source_content_fingerprint IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS batch_import_sessions (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_label TEXT NOT NULL,
  durable_root TEXT,
  status TEXT NOT NULL,
  summary_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS batch_import_candidates (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES batch_import_sessions(id) ON DELETE CASCADE,
  candidate_key TEXT NOT NULL,
  display_path TEXT NOT NULL,
  predicted_title TEXT NOT NULL,
  kind TEXT NOT NULL,
  format TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  source_absolute_path TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 1,
  target_project_id TEXT,
  status TEXT NOT NULL,
  result_project_id TEXT,
  result_json TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id, candidate_key)
);

CREATE INDEX IF NOT EXISTS idx_batch_import_candidates_session
  ON batch_import_candidates(session_id);

CREATE INDEX IF NOT EXISTS idx_batch_import_sessions_status
  ON batch_import_sessions(status);
`;
