import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { CharacterStatus } from '@shared/constants/memory';

export interface CharacterRow {
  id: string;
  project_id: string;
  canonical_name: string;
  translated_name: string | null;
  gender: string | null;
  role: string | null;
  description: string | null;
  first_appearance_paragraph_id: string | null;
  metadata: string | null;
  status: string;
  first_chapter: number | null;
  last_chapter: number | null;
  discovered_from_chapter: number | null;
  future_sensitive: number;
  locked: number;
  created_at: string;
  updated_at: string;
}

export interface CharacterAliasRow {
  id: string;
  character_id: string;
  alias: string;
  alias_type: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCharacterInput {
  project_id: string;
  canonical_name: string;
  translated_name?: string | null;
  gender?: string | null;
  role?: string | null;
  description?: string | null;
  status?: CharacterStatus;
  first_chapter?: number | null;
  last_chapter?: number | null;
  locked?: boolean;
}

export class CharacterRepository extends BaseRepository {
  create(input: CreateCharacterInput): CharacterRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO characters (
          id, project_id, canonical_name, translated_name, gender, role, description,
          first_appearance_paragraph_id, metadata, status, first_chapter, last_chapter,
          locked, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.canonical_name,
        input.translated_name ?? null,
        input.gender ?? null,
        input.role ?? null,
        input.description ?? null,
        input.status ?? 'active',
        input.first_chapter ?? null,
        input.last_chapter ?? null,
        input.locked ? 1 : 0,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getById(id), 'character', id);
  }

  getById(id: string): CharacterRow | null {
    return (
      (this.db.prepare(`SELECT * FROM characters WHERE id = ?`).get(id) as
        | CharacterRow
        | undefined) ?? null
    );
  }

  getByName(projectId: string, name: string): CharacterRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM characters WHERE project_id = ? AND canonical_name = ? LIMIT 1`,
      )
      .get(projectId, name) as CharacterRow | undefined;
    if (row) return row;
    const alias = this.db
      .prepare(
        `SELECT c.* FROM characters c
         JOIN character_aliases a ON a.character_id = c.id
         WHERE c.project_id = ? AND a.alias = ? LIMIT 1`,
      )
      .get(projectId, name) as CharacterRow | undefined;
    return alias ?? null;
  }

  listByProject(projectId: string): CharacterRow[] {
    return this.db
      .prepare(`SELECT * FROM characters WHERE project_id = ? ORDER BY canonical_name ASC`)
      .all(projectId) as CharacterRow[];
  }

  addAlias(characterId: string, alias: string, aliasType = 'name'): void {
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO character_aliases (id, character_id, alias, alias_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(newId(), characterId, alias, aliasType, ts.created_at, ts.updated_at);
  }

  listAliases(characterId: string): CharacterAliasRow[] {
    return this.db
      .prepare(`SELECT * FROM character_aliases WHERE character_id = ? ORDER BY alias ASC`)
      .all(characterId) as CharacterAliasRow[];
  }

  update(id: string, patch: Partial<CreateCharacterInput>): CharacterRow | null {
    const existing = this.getById(id);
    if (!existing) return null;

    if (existing.locked === 1 && patch.locked !== false) {
      const guarded: (keyof CreateCharacterInput)[] = [
        'canonical_name',
        'translated_name',
        'gender',
        'role',
        'description',
        'status',
      ];
      for (const key of guarded) {
        if (patch[key] === undefined) continue;
        const rowKey = key as keyof CharacterRow;
        if (patch[key] !== existing[rowKey]) {
          throw new Error(`Character ${id} is locked`);
        }
      }
    }

    this.db
      .prepare(
        `UPDATE characters SET
          canonical_name = ?,
          translated_name = ?,
          gender = ?,
          role = ?,
          description = ?,
          status = ?,
          first_chapter = ?,
          last_chapter = ?,
          locked = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.canonical_name ?? existing.canonical_name,
        patch.translated_name !== undefined ? patch.translated_name : existing.translated_name,
        patch.gender !== undefined ? patch.gender : existing.gender,
        patch.role !== undefined ? patch.role : existing.role,
        patch.description !== undefined ? patch.description : existing.description,
        patch.status ?? existing.status,
        patch.first_chapter !== undefined ? patch.first_chapter : existing.first_chapter,
        patch.last_chapter !== undefined ? patch.last_chapter : existing.last_chapter,
        patch.locked !== undefined ? (patch.locked ? 1 : 0) : existing.locked,
        utcNow(),
        id,
      );
    return this.getById(id);
  }

  touchLastChapter(id: string, chapterNumber: number): void {
    this.db
      .prepare(
        `UPDATE characters SET
          last_chapter = MAX(COALESCE(last_chapter, ?), ?),
          first_chapter = COALESCE(first_chapter, ?),
          updated_at = ?
        WHERE id = ?`,
      )
      .run(chapterNumber, chapterNumber, chapterNumber, utcNow(), id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM characters WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  searchFts(query: string, limit = 20): { character_id: string; rank: number }[] {
    return this.db
      .prepare(
        `SELECT character_id, rank FROM characters_fts WHERE characters_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(query, limit) as { character_id: string; rank: number }[];
  }
}
