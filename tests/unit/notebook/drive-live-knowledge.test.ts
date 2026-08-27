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
import { DRIVE_RESOURCE_KEYS } from '@shared/constants/drive';
import { GOOGLE_DOC_MIME_TYPE } from '@shared/constants/notebook-source-binding';
import { NotebookKnowledgeBuilder } from '@main/notebook/knowledge-builder';
import { listStaticKnowledgeBindings } from '@main/services/notebook-service';

function mockSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`enc:${text}`, 'utf8'),
    decryptString: (buf: Buffer) => buf.toString('utf8').replace(/^enc:/, ''),
    getBackendName: () => 'mock',
  };
}

describe('Translation knowledge Drive LIVE bindings', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let mockClient: MockDriveClient;
  let service: DriveSyncService;
  let projectId: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noveltrans-kb-live-'));
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    resetDriveSyncServiceForTests();

    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });

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

    const project = db.projects.create({ title: 'Live Novel', genre: 'xianxia' });
    projectId = project.id;
    db.driveSyncState.assignWorker(projectId, account.id);
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    resetDriveSyncServiceForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('provisions 9 Google Docs + DRIVE_LIVE bindings', async () => {
    await service.provisionProject(projectId);

    expect(mockClient.createGoogleDocCalls).toBe(9);
    expect(mockClient.createFileCalls).toBe(0);

    const bindings = db.notebookSourceBindings.listByProject(projectId);
    expect(bindings).toHaveLength(9);
    expect(bindings.every((b) => b.binding_type === 'DRIVE_LIVE')).toBe(true);
    expect(bindings.every((b) => b.status === 'active')).toBe(true);
    expect(bindings.every((b) => b.drive_file_id?.startsWith('doc-'))).toBe(true);

    const characters = db.driveResources.getByProjectAndKey(
      projectId,
      DRIVE_RESOURCE_KEYS.CHARACTERS_MD,
    );
    expect(characters?.mime_type).toBe(GOOGLE_DOC_MIME_TYPE);
    expect(listStaticKnowledgeBindings(db, projectId)).toEqual([]);
  });

  it('updates CHARACTERS content in place — same Drive file id', async () => {
    await service.provisionProject(projectId);
    const before = db.driveResources.getByProjectAndKey(
      projectId,
      DRIVE_RESOURCE_KEYS.CHARACTERS_MD,
    );
    const bindingBefore = db.notebookSourceBindings.get(projectId, 'characters');
    expect(before).toBeTruthy();
    expect(bindingBefore).toBeTruthy();
    if (!before || !bindingBefore) return;

    db.characters.create({
      project_id: projectId,
      canonical_name: '王林',
      translated_name: 'Vương Lâm',
      role: 'protagonist',
    });
    new NotebookKnowledgeBuilder(db).rebuildAndTrack(projectId);

    mockClient.updateGoogleDocCalls = 0;
    mockClient.createGoogleDocCalls = 0;
    const result = await service.syncProject(projectId);

    expect(result.updated).toBeGreaterThan(0);
    expect(mockClient.updateGoogleDocCalls).toBeGreaterThan(0);
    expect(mockClient.createGoogleDocCalls).toBe(0);

    const after = db.driveResources.getByProjectAndKey(
      projectId,
      DRIVE_RESOURCE_KEYS.CHARACTERS_MD,
    );
    expect(after?.drive_file_id).toBe(before.drive_file_id);

    const bindingAfter = db.notebookSourceBindings.get(projectId, 'characters');
    expect(bindingAfter?.drive_file_id).toBe(bindingBefore.drive_file_id);
    expect(bindingAfter?.binding_type).toBe('DRIVE_LIVE');

    const content = after ? mockClient.getContent(after.drive_file_id) : undefined;
    expect(content).toContain('王林');
  });

  it('does not create duplicate bindings on second sync', async () => {
    await service.provisionProject(projectId);
    await service.syncProject(projectId);
    expect(db.notebookSourceBindings.listByProject(projectId)).toHaveLength(9);
  });

  it('promotes legacy markdown Drive file to Google Doc once', async () => {
    await service.provisionProject(projectId);
    const state = db.driveSyncState.getByProject(projectId);
    const accountId = state?.google_account_id;
    expect(accountId).toBeTruthy();
    if (!accountId) return;

    const legacy = await mockClient.createFile(
      '03_CHARACTERS.md',
      '# old',
      'folder-legacy',
    );
    db.driveResources.upsert({
      project_id: projectId,
      google_account_id: accountId,
      resource_key: DRIVE_RESOURCE_KEYS.CHARACTERS_MD,
      resource_type: 'file',
      drive_file_id: legacy.id,
      local_hash: 'stale',
      mime_type: 'text/markdown',
    });

    mockClient.createGoogleDocCalls = 0;
    await service.syncProject(projectId, true);

    const row = db.driveResources.getByProjectAndKey(
      projectId,
      DRIVE_RESOURCE_KEYS.CHARACTERS_MD,
    );
    expect(row?.mime_type).toBe(GOOGLE_DOC_MIME_TYPE);
    expect(row?.drive_file_id).not.toBe(legacy.id);
    expect(mockClient.createGoogleDocCalls).toBeGreaterThan(0);
  });
});
