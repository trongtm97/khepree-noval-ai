/**
 * Normalize legacy language codes on projects.
 * zh / zh-CN → zh-Hans; zh-TW / zh-HK → zh-Hant.
 * Empty / null cannot happen (NOT NULL); still safe.
 * Does not drop rows. Default pair for old projects remains Chinese→Vietnamese.
 */
export const MIGRATION_027_LANGUAGE_PROFILES = `
UPDATE projects
SET source_language = CASE
  WHEN lower(source_language) IN ('zh', 'zh-cn', 'zh-sg', 'chi', 'zho') THEN 'zh-Hans'
  WHEN lower(source_language) IN ('zh-tw', 'zh-hk', 'zh-mo') THEN 'zh-Hant'
  WHEN lower(source_language) = 'vie' THEN 'vi'
  WHEN lower(source_language) = 'eng' THEN 'en'
  WHEN lower(source_language) = 'jpn' THEN 'ja'
  WHEN lower(source_language) = 'kor' THEN 'ko'
  ELSE source_language
END
WHERE source_language IS NOT NULL;

UPDATE projects
SET target_language = CASE
  WHEN lower(target_language) IN ('zh', 'zh-cn', 'zh-sg', 'chi', 'zho') THEN 'zh-Hans'
  WHEN lower(target_language) IN ('zh-tw', 'zh-hk', 'zh-mo') THEN 'zh-Hant'
  WHEN lower(target_language) = 'vie' THEN 'vi'
  WHEN lower(target_language) = 'eng' THEN 'en'
  WHEN lower(target_language) = 'jpn' THEN 'ja'
  WHEN lower(target_language) = 'kor' THEN 'ko'
  ELSE target_language
END
WHERE target_language IS NOT NULL;
`;
