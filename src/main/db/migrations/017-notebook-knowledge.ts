export const MIGRATION_017_NOTEBOOK_KNOWLEDGE = `
ALTER TABLE notebook_resources ADD COLUMN knowledge_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notebook_resources ADD COLUMN local_knowledge_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notebook_resources ADD COLUMN last_sync_at TEXT;
ALTER TABLE notebook_resources ADD COLUMN last_drive_sync_at TEXT;
ALTER TABLE notebook_resources ADD COLUMN batches_since_thread_rotate INTEGER NOT NULL DEFAULT 0;

ALTER TABLE story_states ADD COLUMN world_knowledge_json TEXT;

CREATE TABLE IF NOT EXISTS knowledge_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  knowledge_type TEXT NOT NULL,
  content_hash TEXT,
  local_version INTEGER NOT NULL DEFAULT 0,
  remote_version INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 1,
  last_generated_at TEXT,
  last_drive_sync_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, knowledge_type)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_files_project ON knowledge_files(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_dirty ON knowledge_files(project_id, dirty);

CREATE TABLE IF NOT EXISTS knowledge_sync_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  knowledge_type TEXT,
  message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_sync_events_project
  ON knowledge_sync_events(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notebook_hot_deltas (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  cleared_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notebook_hot_deltas_active
  ON notebook_hot_deltas(project_id, cleared_at);
`;
