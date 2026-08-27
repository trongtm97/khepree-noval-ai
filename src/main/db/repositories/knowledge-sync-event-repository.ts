import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';
import type { KnowledgeSyncEventType } from '@shared/constants/knowledge';

export interface KnowledgeSyncEventRow {
  id: string;
  project_id: string;
  event_type: string;
  knowledge_type: string | null;
  message: string | null;
  metadata_json: string | null;
  created_at: string;
}

export class KnowledgeSyncEventRepository extends BaseRepository {
  insert(input: {
    projectId: string;
    eventType: KnowledgeSyncEventType;
    knowledgeType?: string | null;
    message?: string | null;
    metadata?: Record<string, unknown> | null;
  }): KnowledgeSyncEventRow {
    const id = newId();
    const created = utcNow();
    this.db
      .prepare(
        `INSERT INTO knowledge_sync_events (
          id, project_id, event_type, knowledge_type, message, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.eventType,
        input.knowledgeType ?? null,
        input.message ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        created,
      );
    return this.assertRow(
      (this.db.prepare(`SELECT * FROM knowledge_sync_events WHERE id = ?`).get(id) as
        | KnowledgeSyncEventRow
        | undefined) ?? null,
      'knowledge_sync_event',
      id,
    );
  }

  listRecent(projectId: string, limit = 50): KnowledgeSyncEventRow[] {
    return this.db
      .prepare(
        `SELECT * FROM knowledge_sync_events
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(projectId, limit) as KnowledgeSyncEventRow[];
  }
}
