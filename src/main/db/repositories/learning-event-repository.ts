import type { LearningEventType } from '@shared/constants/learning';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';

export interface LearningEventRow {
  id: string;
  project_id: string;
  event_type: string;
  payload: string | null;
  job_id: string | null;
  created_at: string;
}

export class LearningEventRepository extends BaseRepository {
  create(input: {
    project_id: string;
    event_type: LearningEventType;
    payload?: Record<string, unknown> | null;
    job_id?: string | null;
  }): LearningEventRow {
    const id = newId();
    const createdAt = utcNow();
    this.db
      .prepare(
        `INSERT INTO learning_events (id, project_id, event_type, payload, job_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.event_type,
        input.payload ? JSON.stringify(input.payload) : null,
        input.job_id ?? null,
        createdAt,
      );
    return this.assertRow(this.getById(id), 'learning_event', id);
  }

  getById(id: string): LearningEventRow | null {
    return (
      (this.db.prepare(`SELECT * FROM learning_events WHERE id = ?`).get(id) as
        | LearningEventRow
        | undefined) ?? null
    );
  }

  listByProject(
    projectId: string,
    options?: { eventType?: LearningEventType; limit?: number },
  ): LearningEventRow[] {
    const limit = options?.limit ?? 100;
    if (options?.eventType) {
      return this.db
        .prepare(
          `SELECT * FROM learning_events
           WHERE project_id = ? AND event_type = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(projectId, options.eventType, limit) as LearningEventRow[];
    }
    return this.db
      .prepare(
        `SELECT * FROM learning_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(projectId, limit) as LearningEventRow[];
  }
}
