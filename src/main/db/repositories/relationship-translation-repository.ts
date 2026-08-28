import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface RelationshipTranslationRow {
  id: string;
  relationship_id: string;
  edition_id: string;
  target_language: string;
  a_calls_b: string | null;
  b_calls_a: string | null;
  notes: string | null;
  locked: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertRelationshipTranslationInput {
  relationship_id: string;
  edition_id: string;
  target_language: string;
  a_calls_b?: string | null;
  b_calls_a?: string | null;
  notes?: string | null;
  locked?: boolean;
  source?: string;
}

export class RelationshipTranslationRepository extends BaseRepository {
  getByRelationshipAndEdition(
    relationshipId: string,
    editionId: string,
  ): RelationshipTranslationRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM relationship_translations
           WHERE relationship_id = ? AND edition_id = ?`,
        )
        .get(relationshipId, editionId) as RelationshipTranslationRow | undefined) ?? null
    );
  }

  listByEdition(editionId: string): RelationshipTranslationRow[] {
    return this.db
      .prepare(`SELECT * FROM relationship_translations WHERE edition_id = ?`)
      .all(editionId) as RelationshipTranslationRow[];
  }

  upsert(input: UpsertRelationshipTranslationInput): RelationshipTranslationRow {
    const existing = this.getByRelationshipAndEdition(input.relationship_id, input.edition_id);
    const ts = touchTimestamps();

    if (existing) {
      if (existing.locked === 1 && input.locked !== false) {
        const addressChange =
          (input.a_calls_b !== undefined && input.a_calls_b !== existing.a_calls_b) ||
          (input.b_calls_a !== undefined && input.b_calls_a !== existing.b_calls_a);
        if (addressChange) {
          throw new Error(`Relationship translation ${existing.id} is locked`);
        }
      }
      this.db
        .prepare(
          `UPDATE relationship_translations SET
            a_calls_b = ?,
            b_calls_a = ?,
            notes = ?,
            locked = ?,
            source = ?,
            target_language = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          input.a_calls_b !== undefined ? input.a_calls_b : existing.a_calls_b,
          input.b_calls_a !== undefined ? input.b_calls_a : existing.b_calls_a,
          input.notes !== undefined ? input.notes : existing.notes,
          input.locked !== undefined ? (input.locked ? 1 : 0) : existing.locked,
          input.source ?? existing.source,
          input.target_language,
          utcNow(),
          existing.id,
        );
      return this.assertRow(
        this.getByRelationshipAndEdition(input.relationship_id, input.edition_id),
        'relationship_translation',
        existing.id,
      );
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO relationship_translations (
          id, relationship_id, edition_id, target_language, a_calls_b, b_calls_a,
          notes, locked, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.relationship_id,
        input.edition_id,
        input.target_language,
        input.a_calls_b ?? null,
        input.b_calls_a ?? null,
        input.notes ?? null,
        input.locked ? 1 : 0,
        input.source ?? 'manual',
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(
      this.getByRelationshipAndEdition(input.relationship_id, input.edition_id),
      'relationship_translation',
      id,
    );
  }
}
