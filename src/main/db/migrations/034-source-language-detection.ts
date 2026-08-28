import type { MigrationDefinition } from '../migration-runner';

export const MIGRATION_034_SOURCE_LANGUAGE_DETECTION = `
ALTER TABLE projects ADD COLUMN source_language_mode TEXT NOT NULL DEFAULT 'AUTO';
ALTER TABLE projects ADD COLUMN source_language_hint TEXT;
ALTER TABLE projects ADD COLUMN source_language_confidence REAL;
ALTER TABLE projects ADD COLUMN source_language_detection_method TEXT;
ALTER TABLE projects ADD COLUMN source_language_detection_checked_at TEXT;

UPDATE projects SET
  source_language_mode = 'AUTO',
  source_language_confidence = 0.85,
  source_language_detection_method = 'LOCAL',
  source_language_detection_checked_at = updated_at
WHERE source_language IS NOT NULL;
`;

export const MIGRATION_034: MigrationDefinition = {
  version: 34,
  name: 'source_language_detection',
  sql: MIGRATION_034_SOURCE_LANGUAGE_DETECTION,
};
