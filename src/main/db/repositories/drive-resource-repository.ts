import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type {
  KnowledgeResourceKey,
  KnowledgeSyncStatus,
} from '@shared/constants/knowledge';

export interface DriveResourceRow {
  id: string;
  project_id: string;
  drive_file_id: string;
  resource_type: string;
  local_path: string | null;
  remote_hash: string | null;
  local_hash: string | null;
  last_synced_at: string | null;
  google_account_id: string | null;
  resource_key: string | null;
  remote_modified_time: string | null;
  sync_status: string;
  last_error: string | null;
  mime_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertDriveResourceInput {
  project_id: string;
  google_account_id: string;
  resource_key: KnowledgeResourceKey;
  resource_type: string;
  drive_file_id: string;
  local_hash?: string | null;
  remote_hash?: string | null;
  remote_modified_time?: string | null;
  sync_status?: KnowledgeSyncStatus;
  last_error?: string | null;
  mime_type?: string | null;
}

export class DriveResourceRepository extends BaseRepository {
  getByProjectAndKey(
    projectId: string,
    resourceKey: string,
  ): DriveResourceRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM drive_resources WHERE project_id = ? AND resource_key = ?`,
        )
        .get(projectId, resourceKey) as DriveResourceRow | undefined) ?? null
    );
  }

  listByProject(projectId: string): DriveResourceRow[] {
    return this.db
      .prepare(
        `SELECT * FROM drive_resources WHERE project_id = ? ORDER BY resource_key ASC`,
      )
      .all(projectId) as DriveResourceRow[];
  }

  upsert(input: UpsertDriveResourceInput): DriveResourceRow {
    const existing = this.getByProjectAndKey(input.project_id, input.resource_key);
    const ts = touchTimestamps();

    if (existing) {
      this.db
        .prepare(
          `UPDATE drive_resources SET
            google_account_id = ?,
            resource_type = ?,
            drive_file_id = ?,
            local_hash = ?,
            remote_hash = ?,
            remote_modified_time = ?,
            sync_status = ?,
            last_error = ?,
            mime_type = ?,
            last_synced_at = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          input.google_account_id,
          input.resource_type,
          input.drive_file_id,
          input.local_hash ?? existing.local_hash,
          input.remote_hash ?? existing.remote_hash,
          input.remote_modified_time ?? existing.remote_modified_time,
          input.sync_status ?? 'synced',
          input.last_error ?? null,
          input.mime_type !== undefined ? input.mime_type : existing.mime_type,
          ts.updated_at,
          ts.updated_at,
          existing.id,
        );
      return this.assertRow(
        this.getByProjectAndKey(input.project_id, input.resource_key),
        'drive_resource',
        existing.id,
      );
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO drive_resources (
          id, project_id, drive_file_id, resource_type, local_path,
          remote_hash, local_hash, last_synced_at,
          google_account_id, resource_key, remote_modified_time,
          sync_status, last_error, mime_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.drive_file_id,
        input.resource_type,
        input.remote_hash ?? null,
        input.local_hash ?? null,
        ts.updated_at,
        input.google_account_id,
        input.resource_key,
        input.remote_modified_time ?? null,
        input.sync_status ?? 'synced',
        input.last_error ?? null,
        input.mime_type ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(
      this.getByProjectAndKey(input.project_id, input.resource_key),
      'drive_resource',
      id,
    );
  }

  markSkipped(id: string, localHash: string): void {
    this.db
      .prepare(
        `UPDATE drive_resources SET local_hash = ?, sync_status = 'synced', last_error = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(localHash, utcNow(), id);
  }

  markError(id: string, error: string): void {
    this.db
      .prepare(
        `UPDATE drive_resources SET sync_status = 'error', last_error = ?, updated_at = ? WHERE id = ?`,
      )
      .run(error, utcNow(), id);
  }
}
