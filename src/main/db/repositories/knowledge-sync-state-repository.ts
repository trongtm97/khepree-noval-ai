import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import {
  DEFAULT_KNOWLEDGE_SYNC_EVERY_N_CHAPTERS,
  type KnowledgeSyncStatus,
} from '@shared/constants/knowledge';
import type { VersionProbeStatus } from '@shared/constants/notebook-version-probe';

/**
 * Row from legacy table `drive_sync_state` (deprecated name — stores knowledge sync policy).
 * Do not read `root_folder_id` in production; kept for DB backward compatibility only.
 */
export interface KnowledgeSyncStateRow {
  id: string;
  project_id: string;
  google_account_id: string | null;
  /** @deprecated Legacy Drive folder id — do not read in production. */
  root_folder_id: string | null;
  sync_every_n_chapters: number;
  chapters_since_sync: number;
  critical_change_pending: number;
  last_sync_at: string | null;
  sync_status: string;
  last_error: string | null;
  pending_knowledge_version: number;
  pending_sync_nonce: string | null;
  verified_knowledge_version: number;
  verified_sync_nonce: string | null;
  version_probe_status: string;
  created_at: string;
  updated_at: string;
}

export class KnowledgeSyncStateRepository extends BaseRepository {
  getByProject(projectId: string): KnowledgeSyncStateRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM drive_sync_state WHERE project_id = ?`)
        .get(projectId) as KnowledgeSyncStateRow | undefined) ?? null
    );
  }

  ensure(projectId: string): KnowledgeSyncStateRow {
    const existing = this.getByProject(projectId);
    if (existing) return existing;
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO drive_sync_state (
          id, project_id, google_account_id, root_folder_id,
          sync_every_n_chapters, chapters_since_sync, critical_change_pending,
          last_sync_at, sync_status, last_error,
          pending_knowledge_version, pending_sync_nonce,
          verified_knowledge_version, verified_sync_nonce, version_probe_status,
          created_at, updated_at
        ) VALUES (?, ?, NULL, NULL, ?, 0, 0, NULL, 'idle', NULL, 0, NULL, 0, NULL, 'pending', ?, ?)`,
      )
      .run(
        id,
        projectId,
        DEFAULT_KNOWLEDGE_SYNC_EVERY_N_CHAPTERS,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getByProject(projectId), 'drive_sync_state', id);
  }

  assignWorker(projectId: string, accountId: string): KnowledgeSyncStateRow {
    this.ensure(projectId);
    this.db
      .prepare(
        `UPDATE drive_sync_state SET google_account_id = ?, updated_at = ? WHERE project_id = ?`,
      )
      .run(accountId, utcNow(), projectId);
    return this.assertRow(this.getByProject(projectId), 'drive_sync_state', projectId);
  }

  patch(
    projectId: string,
    patch: {
      syncEveryNChapters?: number;
      chaptersSinceSync?: number;
      criticalChangePending?: boolean;
      lastSyncAt?: string | null;
      syncStatus?: KnowledgeSyncStatus;
      lastError?: string | null;
      pendingKnowledgeVersion?: number;
      pendingSyncNonce?: string | null;
      verifiedKnowledgeVersion?: number;
      verifiedSyncNonce?: string | null;
      versionProbeStatus?: VersionProbeStatus;
    },
  ): KnowledgeSyncStateRow {
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
          pending_knowledge_version = ?,
          pending_sync_nonce = ?,
          verified_knowledge_version = ?,
          verified_sync_nonce = ?,
          version_probe_status = ?,
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
        patch.pendingKnowledgeVersion ?? row.pending_knowledge_version,
        patch.pendingSyncNonce !== undefined
          ? patch.pendingSyncNonce
          : row.pending_sync_nonce,
        patch.verifiedKnowledgeVersion ?? row.verified_knowledge_version,
        patch.verifiedSyncNonce !== undefined
          ? patch.verifiedSyncNonce
          : row.verified_sync_nonce,
        patch.versionProbeStatus ?? row.version_probe_status,
        utcNow(),
        projectId,
      );
    return this.assertRow(this.getByProject(projectId), 'drive_sync_state', projectId);
  }
}
