export const MIGRATION_005_TERM_VAULT = `
ALTER TABLE terms ADD COLUMN meaning TEXT;

ALTER TABLE terms ADD COLUMN project_count INTEGER NOT NULL DEFAULT 0;

-- Normalize legacy term_type values to Phase 7 taxonomy
UPDATE terms SET term_type = 'PERSON' WHERE term_type = 'name';
UPDATE terms SET term_type = 'LOCATION' WHERE term_type = 'place';
UPDATE terms SET term_type = 'ITEM' WHERE term_type = 'item';
UPDATE terms SET term_type = 'SKILL' WHERE term_type = 'skill';
UPDATE terms SET term_type = 'ORGANIZATION' WHERE term_type = 'organization';
UPDATE terms SET term_type = 'TITLE' WHERE term_type = 'title';
UPDATE terms SET term_type = 'OTHER' WHERE term_type = 'other';

CREATE TABLE IF NOT EXISTS term_candidates (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id          TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  source_text         TEXT NOT NULL,
  suggested_type      TEXT,
  suggested_translation TEXT,
  confidence          REAL,
  frequency           INTEGER NOT NULL DEFAULT 1,
  heuristic_tags      TEXT,
  context_snippet     TEXT,
  status              TEXT NOT NULL DEFAULT 'PENDING',
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_term_candidates_project ON term_candidates(project_id);
CREATE INDEX IF NOT EXISTS idx_term_candidates_status ON term_candidates(status);
CREATE INDEX IF NOT EXISTS idx_term_candidates_source ON term_candidates(source_text);

CREATE INDEX IF NOT EXISTS idx_terms_type ON terms(term_type);
CREATE INDEX IF NOT EXISTS idx_terms_locked ON terms(locked);
`;
