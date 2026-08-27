import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { resetDriveSyncServiceForTests } from '@main/services/drive-sync-service-singleton';
import { DriveOAuthService } from '@main/drive/drive-oauth-service';
import { DriveSyncService } from '@main/drive/drive-sync-service';
import { MockDriveClient } from '@main/drive/mock-drive-client';
import { SecretStorageService } from '@main/security/secret-storage-service';
import { createElectronSafeStorageBackend } from '@main/security/safe-storage-backend';
import {
  DRIVE_RESOURCE_KEYS,
  DRIVE_ROOT_FOLDER_NAME,
} from '@shared/constants/drive';
import { hashContent } from '@main/drive/drive-content-builder';

function mockSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`enc:${text}`, 'utf8'),
    decryptString: (buf: Buffer) => buf.toString('utf8').replace(/^enc:/, ''),
    getBackendName: () => 'mock',
  };
}

describe('DriveSyncService', () => {
  let tempRoot: string;
  let dataDir: string;
  let backupsDir: string;
  let db: DatabaseManager;
  let mockClient: MockDriveClient;
  let service: DriveSyncService;
  let projectId: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noveltrans-drive-'));
    const paths = resolveAppPaths(tempRoot);
    dataDir = paths.data;
    backupsDir = paths.backups;
    closeDatabase();
    resetDriveSyncServiceForTests();

    db = createDatabaseManager({ dataDir, backupsDir });

    const secretStorage = new SecretStorageService({
      backend: createElectronSafeStorageBackend(mockSafeStorage()),
      repository: db.secrets,
    });
    const oauth = new DriveOAuthService(secretStorage);

    mockClient = new MockDriveClient();
    service = new DriveSyncService(db, db.googleAccounts, oauth, () =>
      Promise.resolve(mockClient),
    );

    const account = db.googleAccounts.create({
      label: 'Worker',
      email: 'worker@test.com',
      displayName: 'Worker',
      profileDirName: 'profile-1',
      status: 'READY',
      plan: 'UNKNOWN',
    });

    const project = db.projects.create({ title: 'Test Novel', genre: 'xianxia' });
    projectId = project.id;
    db.driveSyncState.assignWorker(projectId, account.id);
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    resetDriveSyncServiceForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('provisions NovelTrans/project folder tree and owned files', async () => {
    await service.provisionProject(projectId);

    const root = await mockClient.findFolder(DRIVE_ROOT_FOLDER_NAME);
    expect(root).not.toBeNull();

    const status = service.getStatus(projectId);
    expect(status.syncStatus).toBe('synced');
    expect(status.resources.length).toBeGreaterThanOrEqual(7);
    expect(mockClient.createGoogleDocCalls).toBeGreaterThanOrEqual(5);
  });

  it('skips Drive update when local content hash unchanged', async () => {
    await service.provisionProject(projectId);
    mockClient.updateCalls = 0;
    mockClient.updateGoogleDocCalls = 0;

    const first = await service.syncProject(projectId);
    expect(first.updated).toBe(0);
    expect(first.skipped).toBeGreaterThan(0);
    expect(mockClient.updateCalls).toBe(0);
    expect(mockClient.updateGoogleDocCalls).toBe(0);
  });

  it('updates Drive Google Doc when content hash changes', async () => {
    await service.provisionProject(projectId);

    const row = db.driveResources.getByProjectAndKey(
      projectId,
      DRIVE_RESOURCE_KEYS.RULES_MD,
    );
    if (!row?.google_account_id) {
      throw new Error('rules resource missing');
    }
    db.driveResources.upsert({
      project_id: projectId,
      google_account_id: row.google_account_id,
      resource_key: DRIVE_RESOURCE_KEYS.RULES_MD,
      resource_type: 'google_doc',
      drive_file_id: row.drive_file_id,
      local_hash: 'stale-hash',
      mime_type: row.mime_type,
    });

    mockClient.updateGoogleDocCalls = 0;
    const result = await service.syncProject(projectId);
    expect(result.updated).toBeGreaterThan(0);
    expect(mockClient.updateGoogleDocCalls).toBeGreaterThan(0);
  });

  it('schedules sync every N chapters or on critical change', () => {
    service.setSyncSchedule(projectId, 10);

    for (let i = 0; i < 9; i += 1) {
      expect(service.onChapterCompleted(projectId).shouldSync).toBe(false);
    }
    expect(service.onChapterCompleted(projectId).shouldSync).toBe(true);

    service.setSyncSchedule(projectId, 10);
    for (let i = 0; i < 5; i += 1) service.onChapterCompleted(projectId);
    service.markCriticalChange(projectId);
    expect(service.onChapterCompleted(projectId).shouldSync).toBe(true);
  });

  it('batch chapterCount=3 advances counter by 3 (not +1 per job)', () => {
    service.setSyncSchedule(projectId, 10);
    const result = service.onChapterCompleted(projectId, 3);
    expect(result.shouldSync).toBe(false);
    expect(result.chaptersSinceSync).toBe(3);
    expect(db.driveSyncState.ensure(projectId).chapters_since_sync).toBe(3);
  });

  it('hashes content deterministically', () => {
    expect(hashContent('abc')).toHaveLength(64);
    expect(hashContent('abc')).toBe(hashContent('abc'));
  });
});
