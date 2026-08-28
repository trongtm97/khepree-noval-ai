import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { DatabaseManager } from '../database-manager';

/**
 * Edition-scoped character preferred names.
 * characters.translated_name is legacy — backfilled then superseded by this table.
 */
export const MIGRATION_032_CHARACTER_TRANSLATIONS = `
CREATE TABLE IF NOT EXISTS character_translations (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  edition_id TEXT NOT NULL REFERENCES translation_editions(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  preferred_name TEXT,
  aliases_json TEXT,
  notes TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (character_id, edition_id)
);

CREATE INDEX IF NOT EXISTS idx_character_translations_edition
  ON character_translations(edition_id);

CREATE INDEX IF NOT EXISTS idx_character_translations_character
  ON character_translations(character_id);

CREATE TABLE IF NOT EXISTS relationship_translations (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES character_relationships(id) ON DELETE CASCADE,
  edition_id TEXT NOT NULL REFERENCES translation_editions(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  a_calls_b TEXT,
  b_calls_a TEXT,
  notes TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (relationship_id, edition_id)
);

CREATE INDEX IF NOT EXISTS idx_relationship_translations_edition
  ON relationship_translations(edition_id);

CREATE INDEX IF NOT EXISTS idx_relationship_translations_relationship
  ON relationship_translations(relationship_id);
`;

function utcNow(): string {
  return new Date().toISOString();
}

/** Migrate characters.translated_name + relationship address terms into default/active edition rows. */
export function runMigration032Backfill(db: Database.Database): void {
  const now = utcNow();

  const projects = db
    .prepare(
      `SELECT id, active_edition_id, target_language FROM projects WHERE deleted_at IS NULL`,
    )
    .all() as { id: string; active_edition_id: string | null; target_language: string }[];

  const resolveEdition = db.prepare(
    `SELECT id, target_language FROM translation_editions
     WHERE project_id = ? ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, created_at ASC LIMIT 1`,
  );

  const insertCharTr = db.prepare(
    `INSERT OR IGNORE INTO character_translations (
      id, character_id, edition_id, target_language, preferred_name, aliases_json,
      notes, locked, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, 'migration', ?, ?)`,
  );

  const insertRelTr = db.prepare(
    `INSERT OR IGNORE INTO relationship_translations (
      id, relationship_id, edition_id, target_language, a_calls_b, b_calls_a,
      notes, locked, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 'migration', ?, ?)`,
  );

  for (const project of projects) {
    const edition = resolveEdition.get(project.id, project.active_edition_id ?? '') as
      | { id: string; target_language: string }
      | undefined;
    if (!edition) continue;

    const characters = db
      .prepare(
        `SELECT id, translated_name FROM characters
         WHERE project_id = ? AND translated_name IS NOT NULL AND TRIM(translated_name) != ''`,
      )
      .all(project.id) as { id: string; translated_name: string }[];

    for (const ch of characters) {
      insertCharTr.run(
        randomUUID(),
        ch.id,
        edition.id,
        edition.target_language,
        ch.translated_name,
        now,
        now,
      );
    }

    const relationships = db
      .prepare(
        `SELECT id, a_calls_b, b_calls_a FROM character_relationships
         WHERE project_id = ?
           AND (
             (a_calls_b IS NOT NULL AND TRIM(a_calls_b) != '')
             OR (b_calls_a IS NOT NULL AND TRIM(b_calls_a) != '')
           )`,
      )
      .all(project.id) as {
      id: string;
      a_calls_b: string | null;
      b_calls_a: string | null;
    }[];

    for (const rel of relationships) {
      insertRelTr.run(
        randomUUID(),
        rel.id,
        edition.id,
        edition.target_language,
        rel.a_calls_b,
        rel.b_calls_a,
        now,
        now,
      );
    }
  }
}

/** Test helper — same backfill logic on an open DatabaseManager connection. */
export function backfillCharacterTranslationsForTests(db: DatabaseManager): void {
  runMigration032Backfill(db.getConnection());
}
