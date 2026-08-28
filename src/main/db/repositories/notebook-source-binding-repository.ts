import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { KnowledgeType } from '@shared/constants/knowledge';
import type {
  NotebookSourceBindingStatus,
  NotebookSourceBindingType,
} from '@shared/constants/notebook-source-binding';
import { LEGACY_BINDING_DRIVE_LIVE } from '../../knowledge/legacy-db-values';

export interface NotebookSourceBindingRow {
  id: string;
  project_id: string;
  notebook_id: string | null;
  knowledge_type: string;
  drive_file_id: string | null;
  source_name: string;
  binding_type: string;
  content_hash: string | null;
  local_version: number;
  remote_version: number;
  last_verified_version: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertNotebookSourceBindingInput {
  projectId: string;
  notebookId?: string | null;
  knowledgeType: KnowledgeType;
  driveFileId?: string | null;
  sourceName: string;
  bindingType: NotebookSourceBindingType;
  contentHash?: string | null;
  localVersion?: number;
  remoteVersion?: number;
  lastVerifiedVersion?: number;
  status?: NotebookSourceBindingStatus;
}

export class NotebookSourceBindingRepository extends BaseRepository {
  get(
    projectId: string,
    knowledgeType: KnowledgeType,
    notebookId?: string | null,
  ): NotebookSourceBindingRow | null {
    if (notebookId) {
      return (
        (this.db
          .prepare(
            `SELECT * FROM notebook_source_bindings
             WHERE project_id = ? AND knowledge_type = ? AND notebook_id = ?`,
          )
          .get(projectId, knowledgeType, notebookId) as
          | NotebookSourceBindingRow
          | undefined) ?? null
      );
    }
    return (
      (this.db
        .prepare(
          `SELECT * FROM notebook_source_bindings
           WHERE project_id = ? AND knowledge_type = ?
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(projectId, knowledgeType) as NotebookSourceBindingRow | undefined) ?? null
    );
  }

  listByProject(projectId: string): NotebookSourceBindingRow[] {
    return this.db
      .prepare(
        `SELECT * FROM notebook_source_bindings
         WHERE project_id = ?
         ORDER BY knowledge_type ASC`,
      )
      .all(projectId) as NotebookSourceBindingRow[];
  }

  listByNotebook(projectId: string, notebookId: string): NotebookSourceBindingRow[] {
    return this.db
      .prepare(
        `SELECT * FROM notebook_source_bindings
         WHERE project_id = ? AND notebook_id = ?
         ORDER BY knowledge_type ASC`,
      )
      .all(projectId, notebookId) as NotebookSourceBindingRow[];
  }

  /** Legacy SQLite rows with deprecated binding_type — read-only for migration tooling. */
  listLegacyDriveLiveBindings(
    projectId: string,
    notebookId?: string | null,
  ): NotebookSourceBindingRow[] {
    const rows = notebookId
      ? this.listByNotebook(projectId, notebookId)
      : this.listByProject(projectId);
    return rows.filter(
      (row) => row.binding_type === LEGACY_BINDING_DRIVE_LIVE && row.status === 'active',
    );
  }

  upsert(input: UpsertNotebookSourceBindingInput): NotebookSourceBindingRow {
    // One owned binding per project + knowledge_type (notebook_id is metadata).
    const existing =
      this.get(input.projectId, input.knowledgeType, input.notebookId ?? null) ??
      this.get(input.projectId, input.knowledgeType);
    const ts = touchTimestamps();
    const notebookId = input.notebookId ?? existing?.notebook_id ?? null;

    if (existing) {
      this.db
        .prepare(
          `UPDATE notebook_source_bindings SET
            notebook_id = ?,
            drive_file_id = ?,
            source_name = ?,
            binding_type = ?,
            content_hash = ?,
            local_version = ?,
            remote_version = ?,
            last_verified_version = ?,
            status = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          notebookId ?? existing.notebook_id,
          input.driveFileId !== undefined ? input.driveFileId : existing.drive_file_id,
          input.sourceName,
          input.bindingType,
          input.contentHash !== undefined ? input.contentHash : existing.content_hash,
          input.localVersion ?? existing.local_version,
          input.remoteVersion ?? existing.remote_version,
          input.lastVerifiedVersion ?? existing.last_verified_version,
          input.status ?? existing.status,
          ts.updated_at,
          existing.id,
        );
      return this.assertRow(
        this.get(input.projectId, input.knowledgeType, notebookId ?? existing.notebook_id),
        'notebook_source_binding',
        existing.id,
      );
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO notebook_source_bindings (
          id, project_id, notebook_id, knowledge_type, drive_file_id, source_name,
          binding_type, content_hash, local_version, remote_version,
          last_verified_version, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        notebookId,
        input.knowledgeType,
        input.driveFileId ?? null,
        input.sourceName,
        input.bindingType,
        input.contentHash ?? null,
        input.localVersion ?? 0,
        input.remoteVersion ?? 0,
        input.lastVerifiedVersion ?? 0,
        input.status ?? 'pending',
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(
      this.get(input.projectId, input.knowledgeType, notebookId),
      'notebook_source_binding',
      id,
    );
  }

  markNeedsMigration(projectId: string, knowledgeType: KnowledgeType, message?: string): void {
    const row = this.get(projectId, knowledgeType);
    if (!row) return;
    this.db
      .prepare(
        `UPDATE notebook_source_bindings SET status = 'needs_migration', updated_at = ? WHERE id = ?`,
      )
      .run(utcNow(), row.id);
    void message;
  }

  markActive(id: string, verifiedVersion?: number): void {
    const row = this.db
      .prepare(`SELECT * FROM notebook_source_bindings WHERE id = ?`)
      .get(id) as NotebookSourceBindingRow | undefined;
    if (!row) return;
    this.db
      .prepare(
        `UPDATE notebook_source_bindings SET
          status = 'active',
          last_verified_version = ?,
          remote_version = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        verifiedVersion ?? row.local_version,
        verifiedVersion ?? row.local_version,
        utcNow(),
        id,
      );
  }

  retire(id: string): void {
    this.db
      .prepare(
        `UPDATE notebook_source_bindings SET status = 'retired', updated_at = ? WHERE id = ?`,
      )
      .run(utcNow(), id);
  }

  countByBindingType(
    projectId: string,
    bindingType: NotebookSourceBindingType,
  ): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM notebook_source_bindings
         WHERE project_id = ? AND binding_type = ? AND status = 'active'`,
      )
      .get(projectId, bindingType) as { c: number };
    return row.c;
  }
}
