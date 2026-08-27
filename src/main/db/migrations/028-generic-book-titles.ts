/**
 * Generic book title fields for any language pair.
 * Legacy title_cn / title_vi remain; backfilled into source_title / target_title.
 */
export const MIGRATION_028_GENERIC_BOOK_TITLES = `
ALTER TABLE projects ADD COLUMN source_title TEXT;
ALTER TABLE projects ADD COLUMN target_title TEXT;

UPDATE projects
SET source_title = COALESCE(source_title, title_cn)
WHERE title_cn IS NOT NULL AND TRIM(title_cn) != '';

UPDATE projects
SET target_title = COALESCE(target_title, title_vi)
WHERE title_vi IS NOT NULL AND TRIM(title_vi) != '';
`;
