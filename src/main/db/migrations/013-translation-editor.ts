export const MIGRATION_013_TRANSLATION_EDITOR = `
ALTER TABLE translations ADD COLUMN human_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE translations ADD COLUMN version_source TEXT NOT NULL DEFAULT 'AI_INITIAL';

ALTER TABLE translation_versions ADD COLUMN version_source TEXT NOT NULL DEFAULT 'AI_INITIAL';
ALTER TABLE translation_versions ADD COLUMN editor_note TEXT;

CREATE INDEX IF NOT EXISTS idx_translations_paragraph
  ON translations(paragraph_id);

CREATE INDEX IF NOT EXISTS idx_translation_versions_translation
  ON translation_versions(translation_id, version DESC);
`;
