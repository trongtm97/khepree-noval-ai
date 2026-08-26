import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface RelationshipRow {
  id: string;
  project_id: string;
  from_character_id: string;
  to_character_id: string;
  relationship_type: string;
  description: string | null;
  since_paragraph_id: string | null;
  a_calls_b: string | null;
  b_calls_a: string | null;
  valid_from_chapter: number | null;
  valid_to_chapter: number | null;
  confidence: number | null;
  source: string;
  locked: number;
  created_at: string;
  updated_at: string;
}

export interface CreateRelationshipInput {
  project_id: string;
  from_character_id: string;
  to_character_id: string;
  relationship_type: string;
  description?: string | null;
  a_calls_b?: string | null;
  b_calls_a?: string | null;
  valid_from_chapter?: number | null;
  valid_to_chapter?: number | null;
  confidence?: number | null;
  source?: string;
  locked?: boolean;
}

export class RelationshipRepository extends BaseRepository {
  create(input: CreateRelationshipInput): RelationshipRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO character_relationships (
          id, project_id, from_character_id, to_character_id, relationship_type,
          description, since_paragraph_id, a_calls_b, b_calls_a,
          valid_from_chapter, valid_to_chapter, confidence, source, locked,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.from_character_id,
        input.to_character_id,
        input.relationship_type,
        input.description ?? null,
        input.a_calls_b ?? null,
        input.b_calls_a ?? null,
        input.valid_from_chapter ?? null,
        input.valid_to_chapter ?? null,
        input.confidence ?? null,
        input.source ?? 'manual',
        input.locked ? 1 : 0,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getById(id), 'relationship', id);
  }

  getById(id: string): RelationshipRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM character_relationships WHERE id = ?`)
        .get(id) as RelationshipRow | undefined) ?? null
    );
  }

  listByProject(projectId: string): RelationshipRow[] {
    return this.db
      .prepare(
        `SELECT * FROM character_relationships WHERE project_id = ? ORDER BY valid_from_chapter ASC, updated_at DESC`,
      )
      .all(projectId) as RelationshipRow[];
  }

  listActiveAtChapter(projectId: string, chapterNumber: number): RelationshipRow[] {
    return this.db
      .prepare(
        `SELECT * FROM character_relationships
         WHERE project_id = ?
           AND (valid_from_chapter IS NULL OR valid_from_chapter <= ?)
           AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?)
         ORDER BY valid_from_chapter ASC`,
      )
      .all(projectId, chapterNumber, chapterNumber) as RelationshipRow[];
  }

  listBetweenCharacters(
    projectId: string,
    charA: string,
    charB: string,
  ): RelationshipRow[] {
    return this.db
      .prepare(
        `SELECT * FROM character_relationships
         WHERE project_id = ?
           AND ((from_character_id = ? AND to_character_id = ?)
             OR (from_character_id = ? AND to_character_id = ?))`,
      )
      .all(projectId, charA, charB, charB, charA) as RelationshipRow[];
  }

  update(id: string, patch: Partial<CreateRelationshipInput>): RelationshipRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    if (existing.locked === 1) {
      throw new Error(`Relationship ${id} is locked`);
    }
    this.db
      .prepare(
        `UPDATE character_relationships SET
          relationship_type = ?,
          description = ?,
          a_calls_b = ?,
          b_calls_a = ?,
          valid_from_chapter = ?,
          valid_to_chapter = ?,
          confidence = ?,
          source = ?,
          locked = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.relationship_type ?? existing.relationship_type,
        patch.description !== undefined ? patch.description : existing.description,
        patch.a_calls_b !== undefined ? patch.a_calls_b : existing.a_calls_b,
        patch.b_calls_a !== undefined ? patch.b_calls_a : existing.b_calls_a,
        patch.valid_from_chapter !== undefined
          ? patch.valid_from_chapter
          : existing.valid_from_chapter,
        patch.valid_to_chapter !== undefined
          ? patch.valid_to_chapter
          : existing.valid_to_chapter,
        patch.confidence !== undefined ? patch.confidence : existing.confidence,
        patch.source ?? existing.source,
        patch.locked !== undefined ? (patch.locked ? 1 : 0) : existing.locked,
        utcNow(),
        id,
      );
    return this.getById(id);
  }
}
