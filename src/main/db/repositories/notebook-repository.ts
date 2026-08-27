import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { NotebookAssistedStep, NotebookStatus } from '@shared/constants/notebook';
import type { NotebookRole } from '@shared/constants/notebook-role';

export interface NotebookResourceRow {
  id: string;
  project_id: string;
  notebook_id: string | null;
  resource_url: string | null;
  linked_drive_resource_id: string | null;
  status: string;
  google_account_id: string | null;
  notebook_name: string | null;
  notebook_role: string;
  last_verified_at: string | null;
  assisted_step: string | null;
  last_error: string | null;
  instructions_hash: string | null;
  knowledge_version: number;
  local_knowledge_version: number;
  last_sync_at: string | null;
  last_drive_sync_at: string | null;
  batches_since_thread_rotate: number;
  created_at: string;
  updated_at: string;
}

export interface UpsertNotebookInput {
  project_id: string;
  google_account_id: string;
  notebook_name: string;
  notebook_role?: NotebookRole;
  notebook_id?: string | null;
  resource_url?: string | null;
  linked_drive_resource_id?: string | null;
  status?: NotebookStatus;
  assisted_step?: NotebookAssistedStep | null;
  last_error?: string | null;
  instructions_hash?: string | null;
  last_verified_at?: string | null;
}

export class NotebookRepository extends BaseRepository {
  getByProjectWorkerRole(
    projectId: string,
    accountId: string,
    role: NotebookRole,
  ): NotebookResourceRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM notebook_resources
           WHERE project_id = ? AND google_account_id = ? AND notebook_role = ?`,
        )
        .get(projectId, accountId, role) as NotebookResourceRow | undefined) ?? null
    );
  }

  listByProjectAndWorker(projectId: string, accountId: string): NotebookResourceRow[] {
    return this.db
      .prepare(
        `SELECT * FROM notebook_resources
         WHERE project_id = ? AND google_account_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(projectId, accountId) as NotebookResourceRow[];
  }

  /**
   * @deprecated Prefer resolveNotebookForPurpose — returns translation/SINGLE row.
   */
  getByProjectAndWorker(
    projectId: string,
    accountId: string,
  ): NotebookResourceRow | null {
    const rows = this.listByProjectAndWorker(projectId, accountId);
    const single = rows.find((r) => r.notebook_role === 'SINGLE');
    if (single) return single;
    return rows.find((r) => r.notebook_role === 'TRANSLATION') ?? rows.at(0) ?? null;
  }

  listByProject(projectId: string): NotebookResourceRow[] {
    return this.db
      .prepare(
        `SELECT * FROM notebook_resources WHERE project_id = ? ORDER BY updated_at DESC`,
      )
      .all(projectId) as NotebookResourceRow[];
  }

  upsert(input: UpsertNotebookInput): NotebookResourceRow {
    const role = input.notebook_role ?? 'TRANSLATION';
    const existing = this.getByProjectWorkerRole(
      input.project_id,
      input.google_account_id,
      role,
    );
    const ts = touchTimestamps();

    if (existing) {
      this.db
        .prepare(
          `UPDATE notebook_resources SET
            notebook_name = ?,
            notebook_id = ?,
            resource_url = ?,
            linked_drive_resource_id = ?,
            status = ?,
            assisted_step = ?,
            last_error = ?,
            instructions_hash = ?,
            last_verified_at = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          input.notebook_name,
          input.notebook_id !== undefined ? input.notebook_id : existing.notebook_id,
          input.resource_url !== undefined ? input.resource_url : existing.resource_url,
          input.linked_drive_resource_id !== undefined
            ? input.linked_drive_resource_id
            : existing.linked_drive_resource_id,
          input.status ?? existing.status,
          input.assisted_step !== undefined
            ? input.assisted_step
            : existing.assisted_step,
          input.last_error !== undefined ? input.last_error : existing.last_error,
          input.instructions_hash !== undefined
            ? input.instructions_hash
            : existing.instructions_hash,
          input.last_verified_at !== undefined
            ? input.last_verified_at
            : existing.last_verified_at,
          ts.updated_at,
          existing.id,
        );
      return this.assertRow(
        this.getByProjectWorkerRole(input.project_id, input.google_account_id, role),
        'notebook',
        existing.id,
      );
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO notebook_resources (
          id, project_id, notebook_id, resource_url, linked_drive_resource_id, status,
          google_account_id, notebook_name, notebook_role, last_verified_at, assisted_step,
          last_error, instructions_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.notebook_id ?? null,
        input.resource_url ?? null,
        input.linked_drive_resource_id ?? null,
        input.status ?? 'pending',
        input.google_account_id,
        input.notebook_name,
        role,
        input.last_verified_at ?? null,
        input.assisted_step ?? null,
        input.last_error ?? null,
        input.instructions_hash ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(
      this.getByProjectWorkerRole(input.project_id, input.google_account_id, role),
      'notebook',
      id,
    );
  }

  markVerified(id: string): NotebookResourceRow | null {
    this.db
      .prepare(
        `UPDATE notebook_resources SET
          status = 'ready',
          assisted_step = NULL,
          last_error = NULL,
          last_verified_at = ?,
          last_sync_at = ?,
          knowledge_version = local_knowledge_version,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(utcNow(), utcNow(), utcNow(), id);
    return (
      (this.db.prepare(`SELECT * FROM notebook_resources WHERE id = ?`).get(id) as
        | NotebookResourceRow
        | undefined) ?? null
    );
  }

  setStatus(id: string, status: NotebookStatus, lastError?: string | null): void {
    this.db
      .prepare(
        `UPDATE notebook_resources SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, lastError ?? null, utcNow(), id);
  }

  bumpLocalKnowledgeVersion(id: string, version: number): void {
    this.db
      .prepare(
        `UPDATE notebook_resources SET local_knowledge_version = ?, updated_at = ? WHERE id = ?`,
      )
      .run(version, utcNow(), id);
  }

  markDriveSynced(id: string): void {
    this.db
      .prepare(
        `UPDATE notebook_resources SET
          last_drive_sync_at = ?,
          status = 'sync_pending',
          updated_at = ?
        WHERE id = ?`,
      )
      .run(utcNow(), utcNow(), id);
  }

  incrementBatchCounter(id: string): number {
    this.db
      .prepare(
        `UPDATE notebook_resources SET
          batches_since_thread_rotate = batches_since_thread_rotate + 1,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(utcNow(), id);
    const row = this.db
      .prepare(`SELECT batches_since_thread_rotate FROM notebook_resources WHERE id = ?`)
      .get(id) as { batches_since_thread_rotate: number } | undefined;
    return row?.batches_since_thread_rotate ?? 0;
  }

  resetBatchCounter(id: string): void {
    this.db
      .prepare(
        `UPDATE notebook_resources SET batches_since_thread_rotate = 0, updated_at = ? WHERE id = ?`,
      )
      .run(utcNow(), id);
  }

  markAssisted(
    id: string,
    step: NotebookAssistedStep,
    error: string,
  ): NotebookResourceRow | null {
    this.db
      .prepare(
        `UPDATE notebook_resources SET
          status = 'assisted_setup',
          assisted_step = ?,
          last_error = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(step, error, utcNow(), id);
    return (
      (this.db.prepare(`SELECT * FROM notebook_resources WHERE id = ?`).get(id) as
        | NotebookResourceRow
        | undefined) ?? null
    );
  }
}
