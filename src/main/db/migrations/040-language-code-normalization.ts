import type { MigrationDefinition } from '../migration-runner';

function normalizeLanguageColumns(db: import('better-sqlite3').Database): void {
  const tables: { table: string; columns: string[] }[] = [
    { table: 'projects', columns: ['source_language', 'target_language', 'source_language_hint'] },
    { table: 'terms', columns: ['source_language', 'target_language'] },
    { table: 'translation_editions', columns: ['target_language'] },
    { table: 'term_translations', columns: ['target_language'] },
  ];

  for (const { table, columns } of tables) {
    for (const column of columns) {
      db.exec(
        `UPDATE ${table}
         SET ${column} = CASE
           WHEN lower(${column}) = 'jw' THEN 'jv'
           WHEN lower(${column}) = 'tl' THEN 'fil'
           ELSE ${column}
         END
         WHERE lower(${column}) IN ('jw', 'tl')`,
      );
    }
  }

  db.exec(
    `UPDATE app_meta
     SET value = CASE
       WHEN lower(value) = 'jw' THEN 'jv'
       WHEN lower(value) = 'tl' THEN 'fil'
       ELSE value
     END
     WHERE key = 'settings.default_target_language'
       AND lower(value) IN ('jw', 'tl')`,
  );
}

/** jw→jv, legacy tl (Filipino)→fil. Tagalog remains available as new `tl` code. */
export const MIGRATION_040_LANGUAGE_CODE_NORMALIZATION: MigrationDefinition = {
  version: 40,
  name: 'language_code_normalization',
  sql: '-- language code normalization (jw→jv, tl→fil)',
  run: normalizeLanguageColumns,
};
