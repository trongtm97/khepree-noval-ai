import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseManager,
  closeDatabase,
  type DatabaseManager,
} from '@main/db/connection';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { AccountWorkerService } from '@main/services/account-worker-service';
import { AuditLogService } from '@main/security/audit-log-service';
import { SecretStorageService } from '@main/security/secret-storage-service';
import type { SafeStorageBackend } from '@main/security/safe-storage-backend';
import { BrowserProfileManager } from '@main/automation/browser-runner/profile-manager';
import { ProfileLeaseLockManager } from '@main/automation/browser-runner/profile-lock';
import {
  AccountAvailabilityService,
  resetAccountAvailabilityServiceForTests,
} from '@main/services/account-availability-service';
import type {
  BrowserSessionController,
  BrowserSessionHandle,
  SessionProbeResult,
} from '@main/automation/browser-runner/browser-session-controller';

function createXorBackend(): SafeStorageBackend {
  return {
    isAvailable: () => Promise.resolve(true),
    encrypt(plainText: string) {
      return Promise.resolve({ ciphertext: Buffer.from(`x:${plainText}`, 'utf8') });
    },
    decrypt(encrypted: Buffer) {
      return Promise.resolve({
        plaintext: encrypted.toString('utf8').replace(/^x:/, ''),
        shouldReEncrypt: false,
      });
    },
    getBackendName: () => 'test',
  };
}

function createMockBrowser(probe: SessionProbeResult): BrowserSessionController {
  return {
    open(options) {
      const handle: BrowserSessionHandle = {
        profilePath: options.profilePath,
        close: () => Promise.resolve(),
        probeSession: () => Promise.resolve(probe),
        extractGeminiCookies: () =>
          Promise.resolve({ secure1psid: 'mock', secure1psidts: 'mock' }),
        isOpen: () => true,
        focus: () => Promise.resolve(),
      };
      return Promise.resolve(handle);
    },
  };
}

describe('account availability consistency', () => {
  let tempRoot: string;
  let dataDir: string;
  let backupsDir: string;
  let db: DatabaseManager;
  let service: AccountWorkerService;
  let availability: AccountAvailabilityService;

  beforeEach(() => {
    resetAccountAvailabilityServiceForTests();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noveltrans-avail-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    dataDir = paths.data;
    backupsDir = paths.backups;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.mkdirSync(paths.browserProfiles, { recursive: true });
    closeDatabase();

    db = createDatabaseManager({ dataDir, backupsDir });
    const profiles = new BrowserProfileManager();
    const locks = new ProfileLeaseLockManager();
    service = new AccountWorkerService({
      accounts: db.googleAccounts,
      auditLog: new AuditLogService(db.auditLog, db.appMeta),
      secretStorage: new SecretStorageService({
        backend: createXorBackend(),
        repository: db.secrets,
      }),
      profiles,
      locks,
      browser: createMockBrowser({
        usable: true,
        email: 'user@gmail.com',
        displayName: 'User',
      }),
    });
    availability = new AccountAvailabilityService(db);
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    resetAccountAvailabilityServiceForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('reports ready=1 for single READY enabled account', async () => {
    const added = await service.addAccount({ skipBrowser: true });
    await service.completeLogin(added.id, { email: 'user@gmail.com' });

    const resolved = availability.resolve(added.id);
    expect(resolved.availability).toBe('READY');
    expect(resolved.usableForNewJob).toBe(true);
    expect(availability.summarize().ready).toBe(1);
  });

  it('pause → ready=0 paused=1', async () => {
    const added = await service.addAccount({ skipBrowser: true });
    await service.completeLogin(added.id, { email: 'user@gmail.com' });
    service.disableWorker(added.id);

    const summary = availability.summarize();
    expect(summary.ready).toBe(0);
    expect(summary.paused).toBe(1);
  });

  it('busy worker → busy=1', async () => {
    const added = await service.addAccount({ skipBrowser: true });
    await service.completeLogin(added.id, { email: 'user@gmail.com' });
    const worker = db.workerStates.getByAccountId(added.id);
    expect(worker).toBeTruthy();

    const project = db.projects.create({
      title: 'Truyện 1',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const job = db.jobs.create({
      project_id: project.id,
      type: 'TRANSLATE',
      state: 'RUNNING',
      worker_id: worker!.id,
      pinned_account_id: added.id,
    });
    db.workerStates.markBusy(worker!.id, job.id);

    const resolved = availability.resolve(added.id);
    expect(resolved.availability).toBe('BUSY');
    expect(availability.summarize().busy).toBe(1);
  });

  it('login expiry → LOGIN_REQUIRED consistently', async () => {
    const added = await service.addAccount({ skipBrowser: true });
    await service.completeLogin(added.id, { email: 'user@gmail.com' });
    db.googleAccounts.update(added.id, { status: 'LOGIN_REQUIRED' });

    const resolved = availability.resolve(added.id);
    expect(resolved.availability).toBe('LOGIN_REQUIRED');
    expect(availability.summarize().needsAttention).toBe(1);
  });
});
