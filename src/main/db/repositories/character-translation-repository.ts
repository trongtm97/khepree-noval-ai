import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface CharacterTranslationRow {
  id: string;
  character_id: string;
  edition_id: string;
  target_language: string;
  preferred_name: string | null;
  aliases_json: string | null;
  notes: string | null;
  locked: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertCharacterTranslationInput {
  character_id: string;
  edition_id: string;
  target_language: string;
  preferred_name?: string | null;
  aliases_json?: string | null;
  notes?: string | null;
  locked?: boolean;
  source?: string;
}

export class CharacterTranslationRepository extends BaseRepository {
  getByCharacterAndEdition(
    characterId: string,
    editionId: string,
  ): CharacterTranslationRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM character_translations
           WHERE character_id = ? AND edition_id = ?`,
        )
        .get(characterId, editionId) as CharacterTranslationRow | undefined) ?? null
    );
  }

  listByEdition(editionId: string): CharacterTranslationRow[] {
    return this.db
      .prepare(`SELECT * FROM character_translations WHERE edition_id = ?`)
      .all(editionId) as CharacterTranslationRow[];
  }

  listByProjectAndEdition(projectId: string, editionId: string): CharacterTranslationRow[] {
    return this.db
      .prepare(
        `SELECT ct.* FROM character_translations ct
         INNER JOIN characters c ON c.id = ct.character_id
         WHERE c.project_id = ? AND ct.edition_id = ?`,
      )
      .all(projectId, editionId) as CharacterTranslationRow[];
  }

  upsert(input: UpsertCharacterTranslationInput): CharacterTranslationRow {
    const existing = this.getByCharacterAndEdition(input.character_id, input.edition_id);
    const ts = touchTimestamps();

    if (existing) {
      if (existing.locked === 1 && input.locked !== false) {
        const guarded = input.preferred_name !== undefined && input.preferred_name !== existing.preferred_name;
        if (guarded) {
          throw new Error(`Character translation ${existing.id} is locked`);
        }
      }
      this.db
        .prepare(
          `UPDATE character_translations SET
            preferred_name = ?,
            aliases_json = ?,
            notes = ?,
            locked = ?,
            source = ?,
            target_language = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          input.preferred_name !== undefined ? input.preferred_name : existing.preferred_name,
          input.aliases_json !== undefined ? input.aliases_json : existing.aliases_json,
          input.notes !== undefined ? input.notes : existing.notes,
          input.locked !== undefined ? (input.locked ? 1 : 0) : existing.locked,
          input.source ?? existing.source,
          input.target_language,
          utcNow(),
          existing.id,
        );
      return this.assertRow(
        this.getByCharacterAndEdition(input.character_id, input.edition_id),
        'character_translation',
        existing.id,
      );
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO character_translations (
          id, character_id, edition_id, target_language, preferred_name, aliases_json,
          notes, locked, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.character_id,
        input.edition_id,
        input.target_language,
        input.preferred_name ?? null,
        input.aliases_json ?? null,
        input.notes ?? null,
        input.locked ? 1 : 0,
        input.source ?? 'manual',
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getByCharacterAndEdition(input.character_id, input.edition_id), 'character_translation', id);
  }

  deleteByCharacterAndEdition(characterId: string, editionId: string): boolean {
    const result = this.db
      .prepare(
        `DELETE FROM character_translations WHERE character_id = ? AND edition_id = ?`,
      )
      .run(characterId, editionId);
    return result.changes > 0;
  }
}
