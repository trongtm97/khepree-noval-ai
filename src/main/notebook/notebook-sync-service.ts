import type { DatabaseManager } from '../db/database-manager';
import {
  KNOWLEDGE_FILE_NAMES,
  KNOWLEDGE_TYPES,
  type KnowledgeType,
} from '@shared/constants/knowledge';
import { NotebookKnowledgeBuilder, loadNotebookSettings } from './knowledge-builder';
import {
  FILE_KEY_TO_NAME,
  OWNED_FILE_KEYS,
  writeKnowledgeSourceFiles,
} from '../drive/drive-content-builder';
import { logger } from '../logging/logger';
import path from 'node:path';
import { pathsService } from '../services/paths-service';

const TYPE_BY_EVENT: Record<string, KnowledgeType[]> = {
  PROJECT_METADATA_CHANGED: ['book_profile'],
  TERM_CHANGED: ['project_terms'],
  CHARACTER_CHANGED: ['characters'],
  RELATIONSHIP_CHANGED: ['relationships'],
  STORY_STATE_CHANGED: ['story_state', 'recent_context'],
  WORLD_KNOWLEDGE_CHANGED: ['world_knowledge'],
  RECENT_CONTEXT_CHANGED: ['recent_context'],
  ALL: [...KNOWLEDGE_TYPES],
};

export type KnowledgeDirtyEvent = keyof typeof TYPE_BY_EVENT;

export interface NotebookHealthDto {
  projectId: string;
  accountId: string | null;
  notebookName: string | null;
  status: string;
  localVersion: number;
  notebookVersion: number;
  lastSyncAt: string | null;
  lastVerifiedAt: string | null;
  lastDriveSyncAt: string | null;
  lastError: string | null;
  files: {
    type: KnowledgeType;
    name: string;
    dirty: boolean;
    localVersion: number;
    remoteVersion: number;
    contentHash: string | null;
  }[];
  dirty: boolean;
  usableForSlimPack: boolean;
}

export class NotebookSyncService {
  private readonly builder: NotebookKnowledgeBuilder;

  constructor(
    private readonly db: DatabaseManager,
    private readonly syncProjectDrive?: (projectId: string) => Promise<unknown>,
  ) {
    this.builder = new NotebookKnowledgeBuilder(db);
  }

  markDirty(projectId: string, event: KnowledgeDirtyEvent, hotPayload?: string): void {
    const types = TYPE_BY_EVENT[event] ?? [...KNOWLEDGE_TYPES];
    this.db.knowledgeFiles.markAllDirty(projectId, types);
    const localVersion = this.db.knowledgeFiles.maxLocalVersion(projectId);
    for (const mapping of this.db.notebooks.listByProject(projectId)) {
      this.db.notebooks.bumpLocalKnowledgeVersion(mapping.id, localVersion);
      // Force fat-pack on next send: ready AND sync_pending still trust Notebook cold
      // knowledge which may lag until Drive→Notebook verify.
      if (mapping.status === 'ready' || mapping.status === 'sync_pending') {
        this.db.notebooks.setStatus(mapping.id, 'stale');
      }
    }
    if (hotPayload) {
      this.db.notebookHotDeltas.insert(projectId, event, hotPayload);
    }
    logger.info('Knowledge marked dirty', { projectId, event, types });
  }

  rebuildKnowledge(projectId: string): ReturnType<NotebookKnowledgeBuilder['buildAll']> {
    return this.builder.rebuildAndTrack(projectId);
  }

  writeLocalSources(projectId: string, accountId: string): string[] {
    const docs = this.rebuildKnowledge(projectId);
    const sources = OWNED_FILE_KEYS.map((key) => ({
      name: FILE_KEY_TO_NAME[key],
      content: docs[key],
    }));
    const dir = path.join(
      pathsService.getPath('cache'),
      'automation',
      accountId,
      'notebook-sources',
      projectId,
    );
    return writeKnowledgeSourceFiles(dir, sources);
  }

  /**
   * Drive upload then mark sync_pending. Caller verifies Notebook sources separately.
   */
  async syncDrive(projectId: string): Promise<{ updated: boolean }> {
    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'DRIVE_SYNC_STARTED',
      message: 'Đã gửi dữ liệu bộ nhớ lên Google Drive.',
    });
    this.rebuildKnowledge(projectId);

    if (this.syncProjectDrive) {
      await this.syncProjectDrive(projectId);
    }

    for (const type of KNOWLEDGE_TYPES) {
      this.db.knowledgeFiles.markDriveSynced(projectId, type);
    }

    for (const mapping of this.db.notebooks.listByProject(projectId)) {
      this.db.notebooks.markDriveSynced(mapping.id);
    }

    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'DRIVE_SYNC_COMPLETED',
      message: 'Đã cập nhật dữ liệu trên Google Drive.',
    });
    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'NOTEBOOK_SYNC_PENDING',
      message: 'Đang chờ Notebook cập nhật nguồn.',
    });

    return { updated: true };
  }

  markNotebookVerified(projectId: string, accountId: string): void {
    const mapping = this.db.notebooks.getByProjectAndWorker(projectId, accountId);
    if (!mapping) return;
    for (const type of KNOWLEDGE_TYPES) {
      this.db.knowledgeFiles.markVerified(projectId, type);
    }
    this.db.notebooks.markVerified(mapping.id);
    this.db.notebookHotDeltas.clearActive(projectId);
    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'NOTEBOOK_SYNC_VERIFIED',
      message: 'Notebook đã cập nhật bộ nhớ.',
    });
  }

  maybeAutoSyncAfterChapter(projectId: string): { shouldSync: boolean } {
    const settings = loadNotebookSettings(this.db, projectId);
    const state = this.db.driveSyncState.ensure(projectId);
    const next = state.chapters_since_sync + 1;
    const dirty = this.db.knowledgeFiles.anyDirty(projectId);
    const shouldSync =
      dirty &&
      (state.critical_change_pending === 1 || next >= settings.syncEveryNChapters);
    this.db.driveSyncState.patch(projectId, {
      chaptersSinceSync: shouldSync ? 0 : next,
      criticalChangePending: shouldSync ? false : state.critical_change_pending === 1,
      ...(shouldSync ? { syncStatus: 'pending' as const } : {}),
    });
    return { shouldSync };
  }

  getHealth(projectId: string, accountId?: string | null): NotebookHealthDto {
    const mappings = this.db.notebooks.listByProject(projectId);
    let mapping = accountId
      ? mappings.find((m) => m.google_account_id === accountId)
      : undefined;
    if (!mapping && mappings.length > 0) {
      mapping = mappings[0];
    }

    const files = KNOWLEDGE_TYPES.map((type) => {
      const row = this.db.knowledgeFiles.ensure(projectId, type);
      return {
        type,
        name: KNOWLEDGE_FILE_NAMES[type],
        dirty: row.dirty === 1,
        localVersion: row.local_version,
        remoteVersion: row.remote_version,
        contentHash: row.content_hash,
      };
    });

    const localVersion = this.db.knowledgeFiles.maxLocalVersion(projectId);
    if (!mapping) {
      return {
        projectId,
        accountId: null,
        notebookName: null,
        status: 'pending',
        localVersion,
        notebookVersion: 0,
        lastSyncAt: null,
        lastVerifiedAt: null,
        lastDriveSyncAt: null,
        lastError: null,
        files,
        dirty: this.db.knowledgeFiles.anyDirty(projectId),
        usableForSlimPack: false,
      };
    }

    const status = mapping.status;
    return {
      projectId,
      accountId: mapping.google_account_id,
      notebookName: mapping.notebook_name,
      status,
      localVersion,
      notebookVersion: mapping.knowledge_version,
      lastSyncAt: mapping.last_sync_at,
      lastVerifiedAt: mapping.last_verified_at,
      lastDriveSyncAt: mapping.last_drive_sync_at,
      lastError: mapping.last_error,
      files,
      dirty: this.db.knowledgeFiles.anyDirty(projectId),
      usableForSlimPack: status === 'ready' || status === 'sync_pending',
    };
  }

  buildActiveHotMemoryText(projectId: string): string {
    const deltas = this.db.notebookHotDeltas.listActive(projectId);
    if (deltas.length === 0) return '';
    return [
      '## Hot Memory (unsynced — overrides Notebook)',
      ...deltas.map((d) => `- [${d.kind}] ${d.payload_text}`),
    ].join('\n');
  }
}
