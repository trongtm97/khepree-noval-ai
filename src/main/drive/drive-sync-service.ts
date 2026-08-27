import type { DatabaseManager } from '../db/database-manager';
import type { GoogleAccountRepository } from '../db/repositories/google-account-repository';
import {
  DRIVE_RESOURCE_KEYS,
  DRIVE_ROOT_FOLDER_NAME,
  DRIVE_SOURCES_FOLDER,
  type DriveResourceKey,
  type DriveSyncStatus,
} from '@shared/constants/drive';
import {
  GOOGLE_DOC_MIME_TYPE,
} from '@shared/constants/notebook-source-binding';
import type { KnowledgeType } from '@shared/constants/knowledge';
import type { DriveClient } from './drive-client';
import { isDriveAuthError } from './drive-client';
import type { DriveOAuthService } from './drive-oauth-service';
import {
  FILE_KEY_TO_DOC_TITLE,
  FILE_KEY_TO_KNOWLEDGE_TYPE,
  OWNED_FILE_KEYS,
  hashContent,
  sanitizeProjectFolderName,
} from './drive-content-builder';
import { NotebookKnowledgeBuilder } from '../notebook/knowledge-builder';
import { logger } from '../logging/logger';
export interface DriveSyncResult {
  updated: number;
  skipped: number;
  errors: string[];
}

export interface DriveSyncStatusDto {
  projectId: string;
  accountId: string | null;
  syncStatus: DriveSyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  syncEveryNChapters: number;
  chaptersSinceSync: number;
  criticalChangePending: boolean;
  resources: {
    resourceKey: string;
    driveFileId: string;
    localHash: string | null;
    syncStatus: string;
    lastSyncedAt: string | null;
  }[];
}

export class DriveSyncService {
  constructor(
    private readonly db: DatabaseManager,
    private readonly accounts: GoogleAccountRepository,
    private readonly oauth: DriveOAuthService,
    private readonly createClient: (accountId: string) => Promise<DriveClient> = (accountId) =>
      oauth.createDriveClient(accountId),
  ) {}

  async getOAuthConfigured(): Promise<boolean> {
    return this.oauth.getClientConfig().then((cfg) => cfg !== null);
  }

  async getOAuthStatus() {
    return this.oauth.getConfigStatus();
  }

  async setOAuthClientConfig(config: {
    clientId: string;
    clientSecret?: string;
  }): Promise<void> {
    await this.oauth.setClientConfig(config);
  }

  async connectDrive(accountId: string): Promise<{ email: string | null }> {
    this.accounts.getById(accountId);
    const result = await this.oauth.connect(accountId);
    this.accounts.update(accountId, {
      driveConnected: true,
      status: 'READY',
      email: result.email ?? undefined,
      lastSeenAt: new Date().toISOString(),
    });
    return result;
  }

  async connectDriveWithAuthPayload(
    accountId: string,
    authPayload: string,
  ): Promise<{ email: string | null }> {
    this.accounts.getById(accountId);
    const result = await this.oauth.connectWithAuthPayload(accountId, authPayload);
    this.accounts.update(accountId, {
      driveConnected: true,
      status: 'READY',
      email: result.email ?? undefined,
      lastSeenAt: new Date().toISOString(),
    });
    return result;
  }

  async disconnectDrive(accountId: string): Promise<void> {
    await this.oauth.disconnect(accountId);
    this.accounts.update(accountId, { driveConnected: false });
  }

  assignWorker(projectId: string, accountId: string): void {
    this.db.driveSyncState.assignWorker(projectId, accountId);
  }

  setSyncSchedule(projectId: string, everyNChapters: number): void {
    this.db.driveSyncState.patch(projectId, { syncEveryNChapters: everyNChapters });
  }

  markCriticalChange(projectId: string): void {
    this.db.driveSyncState.patch(projectId, {
      criticalChangePending: true,
      syncStatus: 'pending',
    });
  }

  /**
   * Advance chapters_since_sync by real completed chapter count.
   * Batch 101–103 → pass chapterCount=3 (not +1 per job).
   * Prefer NotebookSyncService.evaluateSyncPolicy from LearningPipeline.
   */
  onChapterCompleted(
    projectId: string,
    chapterCount = 1,
  ): { shouldSync: boolean; chaptersSinceSync: number } {
    const state = this.db.driveSyncState.ensure(projectId);
    const delta = Math.max(0, Math.floor(chapterCount));
    const nextCount = state.chapters_since_sync + delta;
    const shouldSync =
      state.critical_change_pending === 1 ||
      nextCount >= state.sync_every_n_chapters;

    this.db.driveSyncState.patch(projectId, {
      chaptersSinceSync: shouldSync ? 0 : nextCount,
      criticalChangePending: shouldSync ? false : state.critical_change_pending === 1,
      syncStatus: shouldSync ? 'pending' : (state.sync_status as DriveSyncStatus),
    });

    return {
      shouldSync,
      chaptersSinceSync: shouldSync ? 0 : nextCount,
    };
  }

  getStatus(projectId: string): DriveSyncStatusDto {
    const state = this.db.driveSyncState.ensure(projectId);
    const resources = this.db.driveResources.listByProject(projectId);
    return {
      projectId,
      accountId: state.google_account_id,
      syncStatus: state.sync_status as DriveSyncStatus,
      lastSyncAt: state.last_sync_at,
      lastError: state.last_error,
      syncEveryNChapters: state.sync_every_n_chapters,
      chaptersSinceSync: state.chapters_since_sync,
      criticalChangePending: state.critical_change_pending === 1,
      resources: resources.map((row) => ({
        resourceKey: row.resource_key ?? row.resource_type,
        driveFileId: row.drive_file_id,
        localHash: row.local_hash,
        syncStatus: row.sync_status,
        lastSyncedAt: row.last_synced_at,
      })),
    };
  }

  async provisionProject(projectId: string, accountId?: string): Promise<DriveSyncStatusDto> {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const state = this.db.driveSyncState.ensure(projectId);
    const workerId = accountId ?? state.google_account_id;
    if (!workerId) {
      throw new Error('Assign a Google worker before provisioning Drive folder');
    }
    this.db.driveSyncState.assignWorker(projectId, workerId);

    this.db.driveSyncState.patch(projectId, { syncStatus: 'syncing', lastError: null });

    try {
      const client = await this.createClient(workerId);
      await this.ensureProjectTree(client, projectId, project.title, workerId);
      await this.syncOwnedFiles(client, projectId, workerId, false);
      this.db.driveSyncState.patch(projectId, {
        syncStatus: 'synced',
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      });
    } catch (error) {
      return this.handleSyncFailure(projectId, error);
    }

    return this.getStatus(projectId);
  }

  async syncProject(projectId: string, force = false): Promise<DriveSyncResult> {
    const state = this.db.driveSyncState.ensure(projectId);
    if (!state.google_account_id) {
      throw new Error('No Google worker assigned for Drive sync');
    }

    this.db.driveSyncState.patch(projectId, { syncStatus: 'syncing', lastError: null });

    try {
      const client = await this.createClient(state.google_account_id);
      const project = this.db.projects.getById(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      await this.ensureProjectTree(
        client,
        projectId,
        project.title,
        state.google_account_id,
      );
      const result = await this.syncOwnedFiles(
        client,
        projectId,
        state.google_account_id,
        force,
      );
      this.db.driveSyncState.patch(projectId, {
        syncStatus: 'synced',
        lastSyncAt: new Date().toISOString(),
        lastError: result.errors.length ? result.errors.join('; ') : null,
        criticalChangePending: false,
        chaptersSinceSync: 0,
      });
      return result;
    } catch (error) {
      this.handleSyncFailure(projectId, error);
      if (isDriveAuthError(error)) throw error;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  retrySync(projectId: string): Promise<DriveSyncResult> {
    return this.syncProject(projectId, true);
  }

  private handleSyncFailure(projectId: string, error: unknown): DriveSyncStatusDto {
    const message = error instanceof Error ? error.message : String(error);
    const status: DriveSyncStatus = isDriveAuthError(error) ? 'auth_required' : 'error';
    this.db.driveSyncState.patch(projectId, { syncStatus: status, lastError: message });
    return this.getStatus(projectId);
  }

  private async ensureProjectTree(
    client: DriveClient,
    projectId: string,
    projectTitle: string,
    accountId: string,
  ): Promise<string> {
    const root = await this.ensureResource(
      client,
      projectId,
      accountId,
      DRIVE_RESOURCE_KEYS.NOVELTRANS_ROOT,
      'folder',
      DRIVE_ROOT_FOLDER_NAME,
      undefined,
    );

    const projectFolderName = sanitizeProjectFolderName(projectTitle);
    const projectFolder = await this.ensureResource(
      client,
      projectId,
      accountId,
      DRIVE_RESOURCE_KEYS.PROJECT_FOLDER,
      'folder',
      projectFolderName,
      root.drive_file_id,
    );

    await this.ensureResource(
      client,
      projectId,
      accountId,
      DRIVE_RESOURCE_KEYS.SOURCES_FOLDER,
      'folder',
      DRIVE_SOURCES_FOLDER,
      projectFolder.drive_file_id,
    );

    this.db.driveSyncState.setRootFolder(projectId, projectFolder.drive_file_id);
    return projectFolder.drive_file_id;
  }

  private async ensureResource(
    client: DriveClient,
    projectId: string,
    accountId: string,
    resourceKey: DriveResourceKey,
    resourceType: string,
    name: string,
    parentId?: string,
  ) {
    const existing = this.db.driveResources.getByProjectAndKey(projectId, resourceKey);
    if (existing) return existing;

    const found = await client.findFolder(name, parentId);
    const created = found ?? (await client.createFolder(name, parentId));
    return this.db.driveResources.upsert({
      project_id: projectId,
      google_account_id: accountId,
      resource_key: resourceKey,
      resource_type: resourceType,
      drive_file_id: created.id,
      remote_modified_time: created.modifiedTime,
      sync_status: 'synced',
    });
  }

  private async syncOwnedFiles(
    client: DriveClient,
    projectId: string,
    accountId: string,
    force: boolean,
  ): Promise<DriveSyncResult> {
    const projectFolder = this.db.driveResources.getByProjectAndKey(
      projectId,
      DRIVE_RESOURCE_KEYS.PROJECT_FOLDER,
    );
    if (!projectFolder) {
      throw new Error('Project Drive folder not provisioned');
    }

    const docs = new NotebookKnowledgeBuilder(this.db).buildAll(projectId);
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const key of OWNED_FILE_KEYS) {
      const docTitle = FILE_KEY_TO_DOC_TITLE[key];
      const knowledgeType = FILE_KEY_TO_KNOWLEDGE_TYPE[key];
      const content = docs[key];
      const localHash = hashContent(content);

      try {
        const row = this.db.driveResources.getByProjectAndKey(projectId, key);
        if (
          !force &&
          row?.local_hash === localHash &&
          row.mime_type === GOOGLE_DOC_MIME_TYPE &&
          row.drive_file_id
        ) {
          this.db.driveResources.markSkipped(row.id, localHash);
          this.db.knowledgeFiles.markDriveSynced(projectId, knowledgeType, {
            driveFileId: row.drive_file_id,
            mimeType: GOOGLE_DOC_MIME_TYPE,
          });
          this.upsertDriveLiveBinding(projectId, knowledgeType, docTitle, row.drive_file_id, localHash);
          skipped += 1;
          continue;
        }

        let fileId = row?.drive_file_id;
        let mimeType = row?.mime_type ?? null;

        if (fileId && mimeType !== GOOGLE_DOC_MIME_TYPE) {
          const meta = await client.getFileMetadata(fileId);
          if (meta?.mimeType === GOOGLE_DOC_MIME_TYPE) {
            mimeType = GOOGLE_DOC_MIME_TYPE;
          }
        }

        // Legacy markdown → promote to Google Doc (new file id; keep binding updated).
        const needsGoogleDoc = !fileId || mimeType !== GOOGLE_DOC_MIME_TYPE;

        if (needsGoogleDoc) {
          if (fileId && mimeType && mimeType !== GOOGLE_DOC_MIME_TYPE) {
            logger.info('Promoting knowledge markdown to Google Doc', {
              projectId,
              knowledgeType,
              previousFileId: fileId,
            });
          }
          const created = await client.createGoogleDoc(
            docTitle,
            content,
            projectFolder.drive_file_id,
          );
          fileId = created.id;
          mimeType = created.mimeType ?? GOOGLE_DOC_MIME_TYPE;
          this.db.driveResources.upsert({
            project_id: projectId,
            google_account_id: accountId,
            resource_key: key,
            resource_type: 'google_doc',
            drive_file_id: fileId,
            local_hash: localHash,
            remote_hash: localHash,
            remote_modified_time: created.modifiedTime,
            sync_status: 'synced',
            mime_type: mimeType,
          });
          this.db.knowledgeFiles.markDriveSynced(projectId, knowledgeType, {
            driveFileId: fileId,
            mimeType,
          });
          this.upsertDriveLiveBinding(projectId, knowledgeType, docTitle, fileId, localHash);
          updated += 1;
          continue;
        }

        if (!fileId) {
          errors.push(`${key}: missing Drive file id after Google Doc check`);
          continue;
        }
        const liveFileId: string = fileId;

        // Hash match after mime probe — skip update.
        if (!force && row?.local_hash === localHash) {
          this.db.driveResources.upsert({
            project_id: projectId,
            google_account_id: accountId,
            resource_key: key,
            resource_type: 'google_doc',
            drive_file_id: liveFileId,
            local_hash: localHash,
            remote_hash: localHash,
            sync_status: 'synced',
            mime_type: GOOGLE_DOC_MIME_TYPE,
          });
          this.db.knowledgeFiles.markDriveSynced(projectId, knowledgeType, {
            driveFileId: liveFileId,
            mimeType: GOOGLE_DOC_MIME_TYPE,
          });
          this.upsertDriveLiveBinding(projectId, knowledgeType, docTitle, liveFileId, localHash);
          skipped += 1;
          continue;
        }

        const remote = await client.updateGoogleDocContent(liveFileId, content);
        this.db.driveResources.upsert({
          project_id: projectId,
          google_account_id: accountId,
          resource_key: key,
          resource_type: 'google_doc',
          drive_file_id: liveFileId,
          local_hash: localHash,
          remote_hash: localHash,
          remote_modified_time: remote.modifiedTime,
          sync_status: 'synced',
          mime_type: GOOGLE_DOC_MIME_TYPE,
        });
        this.db.knowledgeFiles.markDriveSynced(projectId, knowledgeType, {
          driveFileId: liveFileId,
          mimeType: GOOGLE_DOC_MIME_TYPE,
        });
        this.upsertDriveLiveBinding(projectId, knowledgeType, docTitle, liveFileId, localHash);
        updated += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${key}: ${message}`);
        const row = this.db.driveResources.getByProjectAndKey(projectId, key);
        if (row) this.db.driveResources.markError(row.id, message);
        if (isDriveAuthError(error)) throw error;
      }
    }

    return { updated, skipped, errors };
  }

  private upsertDriveLiveBinding(
    projectId: string,
    knowledgeType: KnowledgeType,
    sourceName: string,
    driveFileId: string,
    contentHash: string,
  ): void {
    const kf = this.db.knowledgeFiles.get(projectId, knowledgeType);
    this.db.notebookSourceBindings.upsert({
      projectId,
      knowledgeType,
      driveFileId,
      sourceName,
      bindingType: 'DRIVE_LIVE',
      contentHash,
      localVersion: kf?.local_version ?? 0,
      remoteVersion: kf?.remote_version ?? 0,
      status: 'active',
    });
  }
}
