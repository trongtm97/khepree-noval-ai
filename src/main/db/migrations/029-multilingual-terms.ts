/**
 * Multilingual term vault — non-destructive.
 * Adds language-pair fields; keeps source_simplified / source_traditional / pinyin / meaning.
 * Existing rows → zh-Hans → vi with source_text = source_simplified.
 */
export const MIGRATION_029_MULTILINGUAL_TERMS = `
ALTER TABLE terms ADD COLUMN source_text TEXT;
ALTER TABLE terms ADD COLUMN source_language TEXT NOT NULL DEFAULT 'zh-Hans';
ALTER TABLE terms ADD COLUMN target_language TEXT NOT NULL DEFAULT 'vi';
ALTER TABLE terms ADD COLUMN source_variants TEXT;
ALTER TABLE terms ADD COLUMN target_variants TEXT;
ALTER TABLE terms ADD COLUMN transliteration TEXT;
ALTER TABLE terms ADD COLUMN transliteration_system TEXT;

UPDATE terms
SET source_text = source_simplified
WHERE source_text IS NULL OR TRIM(source_text) = '';

UPDATE terms
SET transliteration = pinyin
WHERE (transliteration IS NULL OR TRIM(transliteration) = '')
  AND pinyin IS NOT NULL
  AND TRIM(pinyin) != '';

UPDATE terms
SET transliteration_system = 'pinyin'
WHERE transliteration_system IS NULL
  AND pinyin IS NOT NULL
  AND TRIM(pinyin) != '';

UPDATE terms
SET source_variants = '["' || REPLACE(REPLACE(source_traditional, char(92), char(92) || char(92)), '"', char(92) || '"') || '"]'
WHERE (source_variants IS NULL OR TRIM(source_variants) = '')
  AND source_traditional IS NOT NULL
  AND TRIM(source_traditional) != '';

ALTER TABLE term_translations ADD COLUMN target_language TEXT;

UPDATE term_translations
SET target_language = (
  SELECT t.target_language FROM terms t WHERE t.id = term_translations.term_id
)
WHERE target_language IS NULL;

UPDATE term_translations
SET target_language = 'vi'
WHERE target_language IS NULL OR TRIM(target_language) = '';

CREATE INDEX IF NOT EXISTS idx_terms_source_text ON terms(source_text);
CREATE INDEX IF NOT EXISTS idx_terms_lang_pair ON terms(source_language, target_language);
CREATE INDEX IF NOT EXISTS idx_terms_source_pair_scope
  ON terms(source_text, source_language, target_language, scope, scope_ref);
CREATE INDEX IF NOT EXISTS idx_term_translations_lang
  ON term_translations(term_id, target_language);
`;
