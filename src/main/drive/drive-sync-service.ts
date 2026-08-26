import type { DatabaseManager } from '../db/database-manager';
import type { GoogleAccountRepository } from '../db/repositories/google-account-repository';
import {
  DRIVE_RESOURCE_KEYS,
  DRIVE_ROOT_FOLDER_NAME,
  DRIVE_SOURCES_FOLDER,
  type DriveResourceKey,
  type DriveSyncStatus,
} from '@shared/constants/drive';
import type { DriveClient } from './drive-client';
import { isDriveAuthError } from './drive-client';
import type { DriveOAuthService } from './drive-oauth-service';
import {
  FILE_KEY_TO_NAME,
  OWNED_FILE_KEYS,
  buildProjectDriveDocuments,
  hashContent,
  sanitizeProjectFolderName,
} from './drive-content-builder';

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

  onChapterCompleted(projectId: string): { shouldSync: boolean } {
    const state = this.db.driveSyncState.ensure(projectId);
    const nextCount = state.chapters_since_sync + 1;
    const shouldSync =
      state.critical_change_pending === 1 ||
      nextCount >= state.sync_every_n_chapters;

    this.db.driveSyncState.patch(projectId, {
      chaptersSinceSync: shouldSync ? 0 : nextCount,
      criticalChangePending: shouldSync ? false : state.critical_change_pending === 1,
      syncStatus: shouldSync ? 'pending' : (state.sync_status as DriveSyncStatus),
    });

    return { shouldSync };
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

    const docs = buildProjectDriveDocuments(this.db, projectId);
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const key of OWNED_FILE_KEYS) {
      const fileName = FILE_KEY_TO_NAME[key];
      const content = docs[key];
      const localHash = hashContent(content);

      try {
        const row = this.db.driveResources.getByProjectAndKey(projectId, key);
        if (!force && row?.local_hash === localHash) {
          this.db.driveResources.markSkipped(row.id, localHash);
          skipped += 1;
          continue;
        }

        let fileId = row?.drive_file_id;
        if (!fileId) {
          const created = await client.createFile(fileName, content, projectFolder.drive_file_id);
          fileId = created.id;
          this.db.driveResources.upsert({
            project_id: projectId,
            google_account_id: accountId,
            resource_key: key,
            resource_type: 'file',
            drive_file_id: fileId,
            local_hash: localHash,
            remote_hash: localHash,
            remote_modified_time: created.modifiedTime,
            sync_status: 'synced',
          });
          updated += 1;
          continue;
        }

        const remote = await client.updateFileContent(fileId, content);
        this.db.driveResources.upsert({
          project_id: projectId,
          google_account_id: accountId,
          resource_key: key,
          resource_type: 'file',
          drive_file_id: fileId,
          local_hash: localHash,
          remote_hash: localHash,
          remote_modified_time: remote.modifiedTime,
          sync_status: 'synced',
        });
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
}
