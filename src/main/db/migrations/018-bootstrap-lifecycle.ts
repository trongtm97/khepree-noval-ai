/**
 * Bootstrap lifecycle + temporal fields for terms.
 * Pre-migration backup is handled by migration-runner.
 */
export const MIGRATION_018_BOOTSTRAP_LIFECYCLE = `
ALTER TABLE projects ADD COLUMN bootstrap_status TEXT NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE projects ADD COLUMN bootstrap_started_at TEXT;
ALTER TABLE projects ADD COLUMN bootstrap_completed_at TEXT;
ALTER TABLE projects ADD COLUMN bootstrap_through_chapter INTEGER;
ALTER TABLE projects ADD COLUMN bootstrap_version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE projects ADD COLUMN bootstrap_chapter_count INTEGER NOT NULL DEFAULT 10;

ALTER TABLE terms ADD COLUMN first_seen_chapter INTEGER;
ALTER TABLE terms ADD COLUMN discovered_from_chapter INTEGER;

ALTER TABLE term_candidates ADD COLUMN first_seen_chapter INTEGER;
ALTER TABLE term_candidates ADD COLUMN discovered_from_chapter INTEGER;

-- Backfill: projects with any non-empty knowledge file → COMPLETED
UPDATE projects
SET bootstrap_status = 'COMPLETED',
    bootstrap_completed_at = COALESCE(bootstrap_completed_at, updated_at)
WHERE id IN (
  SELECT DISTINCT project_id FROM knowledge_files
  WHERE content_hash IS NOT NULL AND length(content_hash) > 0 AND local_version > 0
);

CREATE INDEX IF NOT EXISTS idx_projects_bootstrap_status ON projects(bootstrap_status);
CREATE INDEX IF NOT EXISTS idx_terms_first_seen ON terms(first_seen_chapter);
`;
