/**
 * Phase 7: Local learning loop — job knowledge version snapshots.
 */
export const MIGRATION_038_LOCAL_LEARNING_LOOP = `
ALTER TABLE jobs ADD COLUMN knowledge_version_at_start INTEGER;
ALTER TABLE jobs ADD COLUMN knowledge_version_at_commit INTEGER;
`;
