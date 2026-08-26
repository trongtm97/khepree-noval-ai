/**
 * Preserve original paragraph spacing for export fidelity.
 */
export const MIGRATION_019_PARAGRAPH_TRAILING_NEWLINES = `
ALTER TABLE chapter_paragraphs ADD COLUMN trailing_newlines INTEGER NOT NULL DEFAULT 2;
`;
