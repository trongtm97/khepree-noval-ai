import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { DriveSyncStatus } from '@shared/constants/drive';
import { DEFAULT_DRIVE_SYNC_EVERY_N_CHAPTERS } from '@shared/constants/drive';

export interface DriveSyncStateRow {
  id: string;
  project_id: string;
  google_account_id: string | null;
  root_folder_id: string | null;
  sync_every_n_chapters: number;
  chapters_since_sync: number;
  critical_change_pending: number;
  last_sync_at: string | null;
  sync_status: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class DriveSyncStateRepository extends BaseRepository {
  getByProject(projectId: string): DriveSyncStateRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM drive_sync_state WHERE project_id = ?`)
        .get(projectId) as DriveSyncStateRow | undefined) ?? null
    );
  }

  ensure(projectId: string): DriveSyncStateRow {
    const existing = this.getByProject(projectId);
    if (existing) return existing;
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO drive_sync_state (
          id, project_id, google_account_id, root_folder_id,
          sync_every_n_chapters, chapters_since_sync, critical_change_pending,
          last_sync_at, sync_status, last_error, created_at, updated_at
        ) VALUES (?, ?, NULL, NULL, ?, 0, 0, NULL, 'idle', NULL, ?, ?)`,
      )
      .run(
        id,
        projectId,
        DEFAULT_DRIVE_SYNC_EVERY_N_CHAPTERS,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getByProject(projectId), 'drive_sync_state', id);
  }

  assignWorker(projectId: string, accountId: string): DriveSyncStateRow {
    this.ensure(projectId);
    this.db
      .prepare(
        `UPDATE drive_sync_state SET google_account_id = ?, updated_at = ? WHERE project_id = ?`,
      )
      .run(accountId, utcNow(), projectId);
    return this.assertRow(this.getByProject(projectId), 'drive_sync_state', projectId);
  }

  setRootFolder(projectId: string, folderId: string): DriveSyncStateRow {
    this.ensure(projectId);
    this.db
      .prepare(
        `UPDATE drive_sync_state SET root_folder_id = ?, updated_at = ? WHERE project_id = ?`,
      )
      .run(folderId, utcNow(), projectId);
    return this.assertRow(this.getByProject(projectId), 'drive_sync_state', projectId);
  }

  patch(
    projectId: string,
    patch: {
      syncEveryNChapters?: number;
      chaptersSinceSync?: number;
      criticalChangePending?: boolean;
      lastSyncAt?: string | null;
      syncStatus?: DriveSyncStatus;
      lastError?: string | null;
    },
  ): DriveSyncStateRow {
    const row = this.ensure(projectId);
    this.db
      .prepare(
        `UPDATE drive_sync_state SET
          sync_every_n_chapters = ?,
          chapters_since_sync = ?,
          critical_change_pending = ?,
          last_sync_at = ?,
          sync_status = ?,
          last_error = ?,
          updated_at = ?
        WHERE project_id = ?`,
      )
      .run(
        patch.syncEveryNChapters ?? row.sync_every_n_chapters,
        patch.chaptersSinceSync ?? row.chapters_since_sync,
        patch.criticalChangePending !== undefined
          ? patch.criticalChangePending
            ? 1
            : 0
          : row.critical_change_pending,
        patch.lastSyncAt !== undefined ? patch.lastSyncAt : row.last_sync_at,
        patch.syncStatus ?? row.sync_status,
        patch.lastError !== undefined ? patch.lastError : row.last_error,
        utcNow(),
        projectId,
      );
    return this.assertRow(this.getByProject(projectId), 'drive_sync_state', projectId);
  }
}
