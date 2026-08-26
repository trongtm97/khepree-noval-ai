import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';

export interface NotebookHotDeltaRow {
  id: string;
  project_id: string;
  kind: string;
  payload_text: string;
  created_at: string;
  cleared_at: string | null;
}

export class NotebookHotDeltaRepository extends BaseRepository {
  insert(projectId: string, kind: string, payloadText: string): NotebookHotDeltaRow {
    const id = newId();
    const created = utcNow();
    this.db
      .prepare(
        `INSERT INTO notebook_hot_deltas (id, project_id, kind, payload_text, created_at, cleared_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, projectId, kind, payloadText, created);
    return this.assertRow(
      (this.db.prepare(`SELECT * FROM notebook_hot_deltas WHERE id = ?`).get(id) as
        | NotebookHotDeltaRow
        | undefined) ?? null,
      'notebook_hot_delta',
      id,
    );
  }

  listActive(projectId: string): NotebookHotDeltaRow[] {
    return this.db
      .prepare(
        `SELECT * FROM notebook_hot_deltas
         WHERE project_id = ? AND cleared_at IS NULL
         ORDER BY created_at ASC`,
      )
      .all(projectId) as NotebookHotDeltaRow[];
  }

  clearActive(projectId: string): number {
    const result = this.db
      .prepare(
        `UPDATE notebook_hot_deltas SET cleared_at = ?
         WHERE project_id = ? AND cleared_at IS NULL`,
      )
      .run(utcNow(), projectId);
    return result.changes;
  }
}
