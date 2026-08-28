import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { ConflictStatus } from '@shared/constants/memory';

export interface MemoryConflictRow {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string | null;
  field_key: string;
  existing_value: string | null;
  proposed_value: string | null;
  delta_source: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConflictInput {
  project_id: string;
  entity_type: string;
  entity_id?: string | null;
  field_key: string;
  existing_value: string | null;
  proposed_value: string | null;
  delta_source?: string;
}

export class MemoryConflictRepository extends BaseRepository {
  create(input: CreateConflictInput): MemoryConflictRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO memory_conflicts (
          id, project_id, entity_type, entity_id, field_key,
          existing_value, proposed_value, delta_source, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.entity_type,
        input.entity_id ?? null,
        input.field_key,
        input.existing_value,
        input.proposed_value,
        input.delta_source ?? 'ai_delta',
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getById(id), 'conflict', id);
  }

  getById(id: string): MemoryConflictRow | null {
    return (
      (this.db.prepare(`SELECT * FROM memory_conflicts WHERE id = ?`).get(id) as
        | MemoryConflictRow
        | undefined) ?? null
    );
  }

  listPending(projectId: string): MemoryConflictRow[] {
    return this.db
      .prepare(
        `SELECT * FROM memory_conflicts WHERE project_id = ? AND status = 'PENDING' ORDER BY created_at DESC`,
      )
      .all(projectId) as MemoryConflictRow[];
  }

  listByProject(projectId: string, limit = 5000): MemoryConflictRow[] {
    return this.db
      .prepare(
        `SELECT * FROM memory_conflicts WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(projectId, limit) as MemoryConflictRow[];
  }

  resolve(id: string, status: ConflictStatus): MemoryConflictRow | null {
    this.db
      .prepare(`UPDATE memory_conflicts SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, utcNow(), id);
    return this.getById(id);
  }
}
