export const MIGRATION_012_LEARNING_PIPELINE = `
-- Memory archives: historical snapshots so current state stays compact
CREATE TABLE IF NOT EXISTS memory_archives (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  archive_kind    TEXT NOT NULL,
  chapter_from    INTEGER,
  chapter_to      INTEGER,
  content_json    TEXT NOT NULL,
  item_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_archives_project
  ON memory_archives(project_id, created_at DESC);

-- Learning activity log (dashboard: promotions, candidates, sync)
CREATE TABLE IF NOT EXISTS learning_events (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  payload         TEXT,
  job_id          TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_events_project
  ON learning_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_events_type
  ON learning_events(project_id, event_type, created_at DESC);

-- Human confirmation counter for confidence (AI never bumps GLOBAL)
ALTER TABLE terms ADD COLUMN human_confirm_count INTEGER NOT NULL DEFAULT 0;
`;
