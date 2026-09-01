/**
 * Phase N09 — Khepree cross-system acceptance (mock integration).
 * Maps acceptance scenarios 1–17 to automated proofs.
 * Live staging / production cross-system runs: docs/KHEPREE_ACCEPTANCE.md
 */
/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/unbound-method, @typescript-eslint/no-dynamic-delete, @typescript-eslint/require-await, @typescript-eslint/no-empty-function, @typescript-eslint/dot-notation */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shell } from 'electron';
import { createDatabaseManager, closeDatabase, type DatabaseManager } from '@main/db/connection';
import { resolveAppPaths } from '@main/services/paths-service';
import { SecretStorageService } from '@main/security/secret-storage-service';
import type { SafeStorageBackend } from '@main/security/safe-storage-backend';
import { KhepreeAccessService } from '@main/khepree/khepree-access-service';
import {
  mockKhepreeCheckoutState,
  mockKhepreeHeartbeatState,
  resetMockKhepreeApiStateForTests,
} from '@main/khepree/khepree-api-client';
import { setKhepreeProductAccessEnforcer } from '@main/khepree/product-access-boundary';
import { lockProtectedJobsOnKhepreeRevocation } from '@main/khepree/licensing-job-guard';
import { JobService } from '@main/services/job-service';
import { resetJobServiceForTests, setJobServiceForTests } from '@main/services/job-service-singleton';
import { UiLanguageService } from '@main/services/ui-language-service';
import {
  OAuthAuthTransactionManager,
} from '@main/khepree/oauth-auth-transaction';
import { KhepreeOAuthCallbackReplayError } from '@main/khepree/errors';
import { KhepreeProductAccessDeniedError } from '@main/khepree/errors';
import { KHEPREE_ACCESS_FEATURE, KHEPREE_FEATURES, KHEPREE_OAUTH_REDIRECT_URI, KHEPREE_SECRET_KEYS } from '@shared/constants/khepree';
import { UI_LANGUAGE_META_KEYS } from '@shared/constants/ui-language';

process.env.KHEPREE_DEV_MOCK = '1';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '0.1.0-test',
    getLocale: () => 'en-US',
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  powerMonitor: {
    on: vi.fn(),
  },
}));

function createXorBackend(available = true): SafeStorageBackend {
  return {
    isAvailable() {
      return Promise.resolve(available);
    },
    encrypt(plainText: string) {
      const buf = Buffer.from(plainText, 'utf8');
      for (let i = 0; i < buf.length; i += 1) buf[i] ^= 0x5a;
      return Promise.resolve({ ciphertext: buf });
    },
    decrypt(encrypted: Buffer) {
      const buf = Buffer.from(encrypted);
      for (let i = 0; i < buf.length; i += 1) buf[i] ^= 0x5a;
      return Promise.resolve({ plaintext: buf.toString('utf8'), shouldReEncrypt: false });
    },
    getBackendName() {
      return 'test-xor';
    },
  };
}

function createService(tempRoot: string): { service: KhepreeAccessService; db: DatabaseManager } {
  const paths = resolveAppPaths(tempRoot);
  fs.mkdirSync(paths.data, { recursive: true });
  fs.mkdirSync(paths.backups, { recursive: true });
  closeDatabase();
  const db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
  const secretStorage = new SecretStorageService({
    backend: createXorBackend(),
    repository: db.secrets,
  });
  const service = new KhepreeAccessService(() => db, secretStorage);
  setKhepreeProductAccessEnforcer((feature) => service.assertProductAccess(feature));
  return { service, db };
}

async function loginActive(service: KhepreeAccessService): Promise<void> {
  const loginPromise = service.startLogin();
  await vi.runAllTimersAsync();
  await loginPromise;
}

describe('Khepree cross-system acceptance (N09)', { timeout: 30_000 }, () => {
  let tempRoot: string;
  const envBackup: Record<string, string | undefined> = {};

  const mockEnvKeys = [
    'KHEPREE_MOCK_DEVICE_LIMIT',
    'KHEPREE_MOCK_NO_ENTITLEMENT',
    'KHEPREE_MOCK_DEVICE_BLOCKED',
    'KHEPREE_MOCK_DEVICE_REMOVED',
    'KHEPREE_MOCK_NETWORK_FAIL',
    'KHEPREE_MOCK_ENTITLEMENT_SUSPENDED',
    'KHEPREE_MOCK_CHECKOUT_STATUS',
    'KHEPREE_MOCK_HEARTBEAT_STATUS',
  ] as const;

  beforeEach(() => {
    vi.useFakeTimers();
    resetMockKhepreeApiStateForTests();
    vi.mocked(shell.openExternal).mockClear();
    for (const key of mockEnvKeys) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-khepree-n09-'));
  });

  afterEach(async () => {
    setKhepreeProductAccessEnforcer(null);
    resetJobServiceForTests();
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.useRealTimers();
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Windows lock
    }
  });

  describe('Test 1 — Language (VI / EN persist across restart)', () => {
    it('N09-1a: Vietnamese first-run choice survives close/reopen', () => {
      const paths = resolveAppPaths(tempRoot);
      fs.mkdirSync(paths.data, { recursive: true });
      fs.mkdirSync(paths.backups, { recursive: true });
      closeDatabase();
      const db1 = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
      const lang1 = new UiLanguageService(() => db1);
      expect(lang1.getStatus().needsFirstRunChooser).toBe(true);
      lang1.completeFirstRun('vi');
      closeDatabase();

      const db2 = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
      const lang2 = new UiLanguageService(() => db2);
      const status = lang2.getStatus();
      expect(status.preference).toBe('vi');
      expect(status.chosen).toBe(true);
      expect(db2.appMeta.get(UI_LANGUAGE_META_KEYS.preference)).toBe('vi');
      closeDatabase();
    });

    it('N09-1b: English first-run choice survives close/reopen', () => {
      const paths = resolveAppPaths(tempRoot);
      fs.mkdirSync(paths.data, { recursive: true });
      fs.mkdirSync(paths.backups, { recursive: true });
      closeDatabase();
      const db1 = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
      new UiLanguageService(() => db1).completeFirstRun('en');
      closeDatabase();

      const db2 = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
      const status = new UiLanguageService(() => db2).getStatus();
      expect(status.preference).toBe('en');
      expect(status.chosen).toBe(true);
      closeDatabase();
    });
  });

  describe('Test 2 — First login (OAuth, no password in app)', () => {
    it('N09-2: browser login opens system browser and creates encrypted session', async () => {
      const { service, db } = createService(tempRoot);
      expect((await service.initializeOnColdStart()).status).toBe('AUTH_REQUIRED');

      const loginPromise = service.startLogin();
      await vi.runAllTimersAsync();
      const state = await loginPromise;

      expect(state.signedIn).toBe(true);
      expect(state.status).toBe('ACTIVE');
      expect(vi.mocked(shell.openExternal).mock.calls.length).toBeGreaterThan(0);

      const publicJson = JSON.stringify(service.getPublicState());
      expect(publicJson).not.toMatch(/password|mock-password|hunter2/i);
      expect(publicJson).not.toMatch(/refreshToken|accessToken|privateKey/i);

      const row = db.secrets.getByKey(KHEPREE_SECRET_KEYS.refreshToken);
      expect(row).not.toBeNull();
      expect(row?.encrypted_blob.toString('utf8')).not.toContain('mock-refresh');
      await service.shutdown();
    });
  });

  describe('Test 3 — No entitlement → free workspace', () => {
    it('N09-3: login succeeds with FREE workspace; paid IPC blocked', async () => {
      process.env.KHEPREE_MOCK_NO_ENTITLEMENT = '1';
      const { service } = createService(tempRoot);
      await loginActive(service);
      const state = service.getPublicState();
      expect(state.signedIn).toBe(true);
      expect(state.status).toBe('FREE');
      expect(state.canUseWorkspace).toBe(true);
      expect(state.entitlement).toBe('none');
      expect(() => service.assertProductAccess(KHEPREE_FEATURES.translation)).toThrow(
        KhepreeProductAccessDeniedError,
      );
      await service.shutdown();
    });
  });

  describe('Test 4 — Entitled user → active workspace', () => {
    it('N09-4: login activates device, verifies lease, enables workspace', async () => {
      const { service } = createService(tempRoot);
      await loginActive(service);
      const state = service.getPublicState();
      expect(state.status).toBe('ACTIVE');
      expect(state.leaseValid).toBe(true);
      expect(state.canUseWorkspace).toBe(true);
      expect(() => service.assertProductAccess(KHEPREE_FEATURES.translation)).not.toThrow();
      await service.shutdown();
    });
  });

  describe('Test 5 — Persistent login', () => {
    it('N09-5: reopen validates refresh silently — no login screen state', async () => {
      const first = createService(tempRoot);
      await loginActive(first.service);
      await first.service.shutdown();

      const second = createService(tempRoot);
      let sawValidating = false;
      second.service.subscribe((s) => {
        if (s.status === 'VALIDATING_SESSION') sawValidating = true;
      });
      const cold = await second.service.initializeOnColdStart();
      expect(sawValidating).toBe(true);
      expect(cold.status).toBe('ACTIVE');
      expect(cold.signedIn).toBe(true);
      expect(cold.canUseWorkspace).toBe(true);
      await second.service.shutdown();
    });
  });

  describe('Test 6 — Cold start offline', () => {
    it('N09-6: network down on reopen blocks workspace — no cached bypass', async () => {
      const first = createService(tempRoot);
      await loginActive(first.service);
      await first.service.shutdown();

      process.env.KHEPREE_MOCK_NETWORK_FAIL = '1';
      const second = createService(tempRoot);
      const cold = await second.service.initializeOnColdStart();
      expect(cold.status).toBe('OFFLINE_COLD_START');
      expect(cold.leaseValid).toBe(false);
      expect(cold.canUseWorkspace).toBe(false);
      await second.service.shutdown();
    });
  });

  describe('Test 7 — Device limit', () => {
    it('N09-7: max devices → DEVICE_LIMIT_REACHED with X/Y counts', async () => {
      process.env.KHEPREE_MOCK_DEVICE_LIMIT = '1';
      const { service } = createService(tempRoot);
      const loginPromise = service.startLogin();
      await vi.runAllTimersAsync();
      const state = await loginPromise;
      expect(state.status).toBe('DEVICE_LIMIT_REACHED');
      expect(state.devicesUsed).toBe(3);
      expect(state.devicesMax).toBe(3);
      await service.shutdown();
    });
  });

  describe('Test 8 — Remove device → Retry Activation', () => {
    it('N09-8: after server removes device, retry activation succeeds', async () => {
      const first = createService(tempRoot);
      await loginActive(first.service);
      await first.service.shutdown();

      process.env.KHEPREE_MOCK_DEVICE_REMOVED = '1';
      const blocked = createService(tempRoot);
      expect((await blocked.service.initializeOnColdStart()).status).toBe('DEVICE_REMOVED');
      await blocked.service.shutdown();

      delete process.env.KHEPREE_MOCK_DEVICE_REMOVED;
      const retry = createService(tempRoot);
      const restored = await retry.service.retryActivation();
      expect(restored.status).toBe('ACTIVE');
      expect(restored.canUseWorkspace).toBe(true);
      await retry.service.shutdown();
    });
  });

  describe('Test 9 — Old device revoked', () => {
    it('N09-9: revoked device cold start loses protected access', async () => {
      const first = createService(tempRoot);
      await loginActive(first.service);
      await first.service.shutdown();

      process.env.KHEPREE_MOCK_DEVICE_REMOVED = '1';
      const second = createService(tempRoot);
      const cold = await second.service.initializeOnColdStart();
      expect(cold.status).toBe('DEVICE_REMOVED');
      expect(cold.canUseWorkspace).toBe(false);
      expect(cold.leaseValid).toBe(false);
      await second.service.shutdown();
    });
  });

  describe('Test 10 — Device block', () => {
    it('N09-10: admin block denies refresh and reactivation path', async () => {
      const first = createService(tempRoot);
      await loginActive(first.service);
      await first.service.shutdown();

      process.env.KHEPREE_MOCK_DEVICE_BLOCKED = '1';
      const second = createService(tempRoot);
      const cold = await second.service.initializeOnColdStart();
      expect(cold.status).toBe('DEVICE_BLOCKED');
      expect(cold.canUseWorkspace).toBe(false);

      const retry = await second.service.retryActivation();
      expect(retry.status).toBe('DEVICE_BLOCKED');
      await second.service.shutdown();
    });
  });

  describe('Test 11 — Entitlement suspension', () => {
    it('N09-11: heartbeat detects suspension and blocks new protected work', async () => {
      const { service } = createService(tempRoot);
      service.setRuntimeRevocationHandler(() => {});
      await loginActive(service);
      mockKhepreeHeartbeatState.nextStatus = 'ENTITLEMENT_SUSPENDED';
      await service.handleHeartbeat();
      const state = service.getPublicState();
      expect(state.status).toBe('ENTITLEMENT_SUSPENDED');
      expect(state.canUseWorkspace).toBe(false);
      expect(() => service.assertProductAccess(KHEPREE_FEATURES.translation)).toThrow(
        KhepreeProductAccessDeniedError,
      );
      await service.shutdown();
    });
  });

  describe('Test 12 — Token theft simulation', () => {
    it('N09-12a: stolen refresh ciphertext fails decrypt on different safeStorage context', async () => {
      const first = createService(tempRoot);
      await loginActive(first.service);
      const stolenRow = first.db.secrets.getByKey(KHEPREE_SECRET_KEYS.refreshToken);
      expect(stolenRow).not.toBeNull();
      await first.service.shutdown();

      const paths = resolveAppPaths(tempRoot);
      closeDatabase();
      const db2 = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
      const unavailableStorage = new SecretStorageService({
        backend: createXorBackend(false),
        repository: db2.secrets,
      });
      if (stolenRow) {
        db2.secrets.upsert({
          secretKey: stolenRow.secret_key,
          encryptedBlob: stolenRow.encrypted_blob,
          kind: stolenRow.kind,
          ownerType: stolenRow.owner_type ?? undefined,
          ownerId: stolenRow.owner_id ?? undefined,
        });
      }
      const victim = new KhepreeAccessService(() => db2, unavailableStorage);
      setKhepreeProductAccessEnforcer((feature) => victim.assertProductAccess(feature));
      const cold = await victim.initializeOnColdStart();
      expect(cold.status).toBe('AUTH_REQUIRED');
      expect(cold.signedIn).toBe(false);
      await victim.shutdown();
    });

    it('N09-12b: corrupt device private key blocks activation — no silent re-gen', async () => {
      const { service, db } = createService(tempRoot);
      await loginActive(service);
      const secretStorage = new SecretStorageService({
        backend: createXorBackend(),
        repository: db.secrets,
      });
      await secretStorage.replace({
        secretKey: KHEPREE_SECRET_KEYS.devicePrivateKey,
        plainText: 'not-a-valid-pkcs8-key',
        kind: 'other',
        ownerType: 'khepree_device',
        ownerId: 'test-install',
      });
      const retry = await service.retryColdStart();
      expect(retry.canUseWorkspace).toBe(false);
      expect(['ERROR', 'AUTH_REQUIRED']).toContain(retry.status);
      await service.shutdown();
    });
  });

  describe('Test 13 — Replay', () => {
    it('N09-13: OAuth callback replay rejected', async () => {
      const mgr = new OAuthAuthTransactionManager();
      mgr.beginTransaction('state-1', 'verifier-1');
      const first = mgr.waitForCallback('state-1');
      mgr.handleAuthCallbackUrl(`${KHEPREE_OAUTH_REDIRECT_URI}?code=code-1&state=state-1`);
      await first;

      mgr.beginTransaction('state-2', 'verifier-2');
      const replay = mgr.waitForCallback('state-2');
      mgr.handleAuthCallbackUrl(`${KHEPREE_OAUTH_REDIRECT_URI}?code=code-1&state=state-1`);
      await expect(replay).rejects.toBeInstanceOf(KhepreeOAuthCallbackReplayError);
    });
  });

  describe('Test 14 — Upgrade', () => {
    it('N09-14: checkout poll detects ACTIVE upgrade without app restart', async () => {
      process.env.KHEPREE_MOCK_NO_ENTITLEMENT = '1';
      mockKhepreeCheckoutState.statusSequence = ['PENDING', 'ACCESS_ACTIVE'];
      mockKhepreeCheckoutState.statusIndex = 0;

      const { service } = createService(tempRoot);
      await loginActive(service);
      expect(service.getPublicState().status).toBe('FREE');

      await service.startCheckout('plan_month:price_month');
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.runAllTimersAsync();

      const final = service.getPublicState();
      expect(final.status).toBe('ACTIVE');
      expect(final.checkoutPhase).toBe('idle');
      expect(final.features[KHEPREE_ACCESS_FEATURE]).toBe(true);
      expect(final.features[KHEPREE_FEATURES.translation]).toBe(true);
      await service.shutdown();
    });
  });

  describe('Test 15 — Payment redirect spoof', () => {
    it('N09-15: browser return alone does not upgrade — API must confirm ACCESS_ACTIVE', async () => {
      process.env.KHEPREE_MOCK_NO_ENTITLEMENT = '1';
      mockKhepreeCheckoutState.statusSequence = ['PENDING'];
      mockKhepreeCheckoutState.statusIndex = 0;

      const { service } = createService(tempRoot);
      await loginActive(service);
      await service.startCheckout('plan_month:price_month');
      await service.checkCheckoutNow();

      const state = service.getPublicState();
      expect(state.status).toBe('FREE');
      expect(state.checkoutPhase).toBe('waiting');
      expect(state.canUseWorkspace).toBe(true);
      await service.shutdown();
    });
  });

  describe('Test 16 — Sign-out vs deactivate semantics', () => {
    it('N09-16: sign out revokes session locally; device id retained until server removal', async () => {
      const { service } = createService(tempRoot);
      await loginActive(service);
      const deviceIdBefore = service['deviceIdentity'].getDeviceId();
      expect(deviceIdBefore).not.toBeNull();

      const signedOut = await service.signOut();
      expect(signedOut.signedIn).toBe(false);
      expect(signedOut.status).toBe('AUTH_REQUIRED');
      expect(service['deviceIdentity'].getDeviceId()).toBe(deviceIdBefore);
      await service.shutdown();
    });

    it('N09-16b: server device removal clears local device id on heartbeat while active', async () => {
      const { service } = createService(tempRoot);
      service.setRuntimeRevocationHandler(() => {});
      await loginActive(service);
      mockKhepreeHeartbeatState.nextStatus = 'DEVICE_REMOVED';
      await service.handleHeartbeat();
      expect(service['deviceIdentity'].getDeviceId()).toBeNull();
      await service.shutdown();
    });
  });

  describe('Test 17 — Job revoke safety', () => {
    it('N09-17: revocation pauses queued jobs without deleting DB rows', () => {
      resetJobServiceForTests();
      const paths = resolveAppPaths(tempRoot);
      closeDatabase();
      const db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
      setJobServiceForTests(new JobService(db));

      const project = db.projects.create({
        title: 'Revoke safety',
        source_language: 'zh',
        target_language: 'vi',
      });
      const job = db.jobs.create({
        project_id: project.id,
        type: 'TRANSLATE',
        state: 'QUEUED',
        chapter_from: 1,
        chapter_to: 3,
        priority: 0,
      });

      const result = lockProtectedJobsOnKhepreeRevocation('ENTITLEMENT_SUSPENDED');
      expect(result.paused).toBe(1);

      const row = db.jobs.getById(job.id);
      expect(row).not.toBeNull();
      expect(row?.state).toBe('PAUSED');
      expect(row?.paused_reason).toBe('khepree:ENTITLEMENT_SUSPENDED');
      expect(db.projects.getById(project.id)).not.toBeNull();

      setJobServiceForTests(null);
      resetJobServiceForTests();
      closeDatabase();
    });
  });
});
