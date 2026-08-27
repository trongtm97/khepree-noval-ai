/**
 * Resumable full-novel preprocess runs + per-part source tracking.
 * Adds temporal provenance columns for FULL knowledge import.
 */
export const MIGRATION_020_FULL_NOVEL_PREPROCESS = `
CREATE TABLE IF NOT EXISTS full_novel_preprocess_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  google_account_id TEXT,
  stage TEXT NOT NULL,
  correlation_id TEXT,
  prompt_hash TEXT,
  raw_response_path TEXT,
  output_dir TEXT,
  error_message TEXT,
  progress_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fnp_runs_project ON full_novel_preprocess_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_fnp_runs_stage ON full_novel_preprocess_runs(stage);

CREATE TABLE IF NOT EXISTS full_novel_preprocess_parts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  part_index INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  chapter_from INTEGER,
  chapter_to INTEGER,
  source_status TEXT NOT NULL DEFAULT 'PENDING',
  notebook_source_name TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id, part_index),
  FOREIGN KEY (run_id) REFERENCES full_novel_preprocess_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fnp_parts_run ON full_novel_preprocess_parts(run_id);
CREATE INDEX IF NOT EXISTS idx_fnp_parts_hash ON full_novel_preprocess_parts(content_hash);

ALTER TABLE terms ADD COLUMN future_sensitive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN discovered_from_chapter INTEGER;
ALTER TABLE characters ADD COLUMN future_sensitive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_relationships ADD COLUMN future_sensitive INTEGER NOT NULL DEFAULT 0;
`;
