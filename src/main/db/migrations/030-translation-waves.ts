/**
 * Parallel Translation Waves — provisional same-project parallel jobs
 * with ordered commit barrier (experimental, off by default).
 */
export const MIGRATION_030_TRANSLATION_WAVES = `
CREATE TABLE IF NOT EXISTS translation_waves (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  edition_id TEXT,
  knowledge_version INTEGER NOT NULL DEFAULT 0,
  chapter_from INTEGER NOT NULL,
  chapter_to INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_translation_waves_project
  ON translation_waves(project_id, status);

CREATE TABLE IF NOT EXISTS wave_jobs (
  id TEXT PRIMARY KEY,
  wave_id TEXT NOT NULL REFERENCES translation_waves(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  snapshot_version INTEGER NOT NULL DEFAULT 0,
  result_status TEXT NOT NULL DEFAULT 'PENDING',
  commit_status TEXT NOT NULL DEFAULT 'PENDING',
  provisional_payload TEXT,
  conflict_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (wave_id, job_id),
  UNIQUE (wave_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_wave_jobs_wave_order
  ON wave_jobs(wave_id, order_index);
CREATE INDEX IF NOT EXISTS idx_wave_jobs_job
  ON wave_jobs(job_id);
`;
