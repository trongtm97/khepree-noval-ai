/**
 * Persist adaptive translation batch sizing decisions and per-project stats.
 */
export const MIGRATION_022_BATCH_SIZE_DECISIONS = `
CREATE TABLE IF NOT EXISTS batch_size_decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  job_id TEXT,
  user_max_chapters INTEGER NOT NULL,
  chosen_chapters INTEGER NOT NULL,
  source_characters INTEGER NOT NULL,
  paragraph_count INTEGER NOT NULL,
  provider_type TEXT,
  reason TEXT,
  output_ratio REAL,
  success INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_batch_stats (
  project_id TEXT PRIMARY KEY,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  incomplete_count INTEGER NOT NULL DEFAULT 0,
  avg_output_ratio REAL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_batch_size_decisions_project
  ON batch_size_decisions(project_id, created_at DESC);
`;
