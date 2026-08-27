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
          Promise.resolve({
            secure1psid: 'mock-psid',
            secure1psidts: 'mock-psidts',
          }),
        isOpen: () => true,
        focus: () => Promise.resolve(),
      };
      return Promise.resolve(handle);
    },
  };
}

describe('AccountWorkerService', () => {
  let tempRoot: string;
  let dataDir: string;
  let backupsDir: string;
  let db: DatabaseManager;
  let service: AccountWorkerService;
  let profiles: BrowserProfileManager;
  let locks: ProfileLeaseLockManager;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noveltrans-acct-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    dataDir = paths.data;
    backupsDir = paths.backups;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.mkdirSync(paths.browserProfiles, { recursive: true });
    closeDatabase();

    db = createDatabaseManager({ dataDir, backupsDir });
    profiles = new BrowserProfileManager();
    locks = new ProfileLeaseLockManager();
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
        email: 'user@example.com',
        displayName: 'user@example.com',
      }),
    });
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates account with isolated profile path and persists', async () => {
    const account = await service.addAccount({
      label: 'Work',
      skipBrowser: true,
    });

    expect(account.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(account.profile_dir_name).toBe(account.id);
    expect(account.status).toBe('LOGIN_REQUIRED');
    expect(profiles.profileExists(account.profile_dir_name)).toBe(true);

    const pathA = profiles.resolveProfilePath(account.profile_dir_name);
    const second = await service.addAccount({ label: 'Personal', skipBrowser: true });
    const pathB = profiles.resolveProfilePath(second.profile_dir_name);
    expect(pathA).not.toBe(pathB);

    db.close();
    const reopened = createDatabaseManager({ dataDir, backupsDir });
    try {
      const reloaded = reopened.googleAccounts.getById(account.id);
      expect(reloaded?.label).toBe('Work');
    } finally {
      reopened.close();
    }
    db = createDatabaseManager({ dataDir, backupsDir });
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
        email: 'user@example.com',
        displayName: 'user@example.com',
      }),
    });
  });

  it('disables worker and requires confirm for delete', async () => {
    const account = await service.addAccount({ label: 'Temp', skipBrowser: true });
    const disabled = service.disableWorker(account.id);
    expect(disabled.status).toBe('DISABLED');
    expect(disabled.worker_enabled).toBe(false);

    await expect(service.removeAccount(account.id, false)).rejects.toThrow(
      /confirmation required/i,
    );

    await service.removeAccount(account.id, true);
    expect(service.getAccount(account.id)).toBeNull();
    expect(profiles.profileExists(account.id)).toBe(false);
  });

  it('enforces profile path isolation lock', async () => {
    const account = await service.addAccount({ label: 'Lock', skipBrowser: true });
    const profilePath = profiles.resolveProfilePath(account.profile_dir_name);

    locks.acquire(profilePath, account.id);
    expect(locks.isLocked(profilePath)).toBe(true);
    expect(() => {
      locks.acquire(profilePath, 'other-worker');
    }).toThrow(/PROFILE_BUSY|already in use|đang được sử dụng/i);

    locks.release(profilePath, account.id);
    expect(locks.isLocked(profilePath)).toBe(false);
  });

  it('completes login with detected email and sets READY', async () => {
    const account = await service.addAccount({ label: 'Login', skipBrowser: true });
    const ready = await service.completeLogin(account.id);
    expect(ready.status).toBe('READY');
    expect(ready.email).toBe('user@example.com');
  });

  it('trusts fallback email when probe says not usable', async () => {
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
        usable: false,
        email: null,
        displayName: null,
        reason: 'LOGIN_REQUIRED',
      }),
    });
    const account = await service.addAccount({ label: 'Manual', skipBrowser: true });
    const ready = await service.completeLogin(account.id, { email: 'manual@example.com' });
    expect(ready.status).toBe('READY');
    expect(ready.email).toBe('manual@example.com');
  });

  it('throws when probe fails and no fallback email', async () => {
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
        usable: false,
        email: null,
        displayName: null,
        reason: 'LOGIN_REQUIRED',
      }),
    });
    const account = await service.addAccount({ label: 'Fail', skipBrowser: true });
    await expect(service.completeLogin(account.id)).rejects.toThrow(/Chưa thấy session|đăng nhập/i);
  });

  it('assigns projects visible on account detail', async () => {
    const project = db.projects.create({ title: 'Novel A' });
    const account = await service.addAccount({ label: 'Worker', skipBrowser: true });
    db.googleAccounts.assignProject(account.id, project.id);

    const detail = service.getAccount(account.id);
    expect(detail?.assigned_project_titles).toContain('Novel A');
  });

  it('returns BUSY instead of throwing when profile already locked', async () => {
    const account = await service.addAccount({ label: 'Busy', skipBrowser: true });
    const profilePath = profiles.resolveProfilePath(account.profile_dir_name);
    locks.acquireLease({
      profilePath,
      ownerId: 'job:123',
      accountId: account.id,
      operation: 'translation',
      label: 'Dịch chương 51–53',
    });

    try {
      const result = await service.testSession(account.id);
      expect(result.usable).toBe(false);
      expect(result.reason).toBe('BUSY');
      expect(result.account.status).toBe('BUSY');
    } finally {
      locks.releaseLease(profilePath, 'job:123');
    }
  });
});

describe('ProfileLeaseLockManager (account-worker suite)', () => {
  it('prevents double acquire on same userDataDir', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noveltrans-lock-'));
    const locks = new ProfileLeaseLockManager();
    try {
      locks.acquireLease({
        profilePath: root,
        ownerId: 'a',
        accountId: 'a',
        operation: 'manual_browser',
      });
      expect(() => {
        locks.acquireLease({
          profilePath: root,
          ownerId: 'b',
          accountId: 'b',
          operation: 'manual_browser',
        });
      }).toThrow(/PROFILE_BUSY|đang được sử dụng/i);
      locks.releaseLease(root, 'a');
      locks.acquireLease({
        profilePath: root,
        ownerId: 'b',
        accountId: 'b',
        operation: 'manual_browser',
      });
      locks.releaseLease(root, 'b');
    } finally {
      locks.recoverIfStale(root, Date.now() + 10_000_000);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('recovers dead-PID lock file on acquire (simulated crash)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noveltrans-orphan-'));
    const lockPath = path.join(root, '.noveltrans.lock');
    try {
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          profilePath: root,
          ownerId: 'old-process',
          accountId: 'old',
          operation: 'legacy',
          pid: 2_147_483_645,
          processInstanceId: 'dead-instance',
          acquiredAt: new Date().toISOString(),
          heartbeatAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          label: 'stale',
        }),
        'utf8',
      );
      const locksB = new ProfileLeaseLockManager();
      expect(() =>
        locksB.acquireLease({
          profilePath: root,
          ownerId: 'new-process',
          accountId: 'new',
          operation: 'manual_browser',
        }),
      ).not.toThrow();
      locksB.releaseLease(root, 'new-process');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
