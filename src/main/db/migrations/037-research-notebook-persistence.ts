/**
 * Phase 5: NotebookLM research-only persistence.
 * - corpus_version + last_full_analysis_at on RESEARCH notebooks
 * - deprecated_at for legacy TRANSLATION mappings (remote notebook kept)
 */
export const MIGRATION_037_RESEARCH_NOTEBOOK = `
ALTER TABLE notebook_resources ADD COLUMN corpus_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notebook_resources ADD COLUMN last_full_analysis_at TEXT;
ALTER TABLE notebook_resources ADD COLUMN deprecated_at TEXT;

ALTER TABLE full_novel_preprocess_parts ADD COLUMN uploaded_hash TEXT;

UPDATE notebook_resources
SET deprecated_at = COALESCE(deprecated_at, datetime('now'))
WHERE notebook_role = 'TRANSLATION';
`;
