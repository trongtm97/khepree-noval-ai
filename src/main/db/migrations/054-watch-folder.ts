export const MIGRATION_054_WATCH_FOLDER = `
CREATE TABLE IF NOT EXISTS watch_roots (
  id TEXT PRIMARY KEY,
  root_path TEXT NOT NULL UNIQUE,
  label TEXT,
  campaign_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  watch_auto_run INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_root_bindings (
  id TEXT PRIMARY KEY,
  watch_root_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  relative_subpath TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(watch_root_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_root_bindings_project
  ON watch_root_bindings(project_id);

CREATE TABLE IF NOT EXISTS source_pending_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  detected_json TEXT NOT NULL,
  enqueue_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  applied_at TEXT,
  UNIQUE(project_id, chapter_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_source_pending_project_status
  ON source_pending_revisions(project_id, status);
`;
