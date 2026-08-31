import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabaseManager, closeDatabase, type DatabaseManager } from '@main/db/connection';
import { resolveAppPaths } from '@main/services/paths-service';
import { SecretStorageService } from '@main/security/secret-storage-service';
import type { SafeStorageBackend } from '@main/security/safe-storage-backend';
import { KhepreeAccessService } from '@main/khepree/khepree-access-service';
import { resetMockKhepreeApiStateForTests } from '@main/khepree/khepree-api-client';
import { setKhepreeProductAccessEnforcer } from '@main/khepree/product-access-boundary';
import { KHEPREE_FEATURES, KHEPREE_SECRET_KEYS } from '@shared/constants/khepree';
import { KhepreeProductAccessDeniedError } from '@main/khepree/errors';

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
}));

function createXorBackend(): SafeStorageBackend {
  return {
    isAvailable() {
      return Promise.resolve(true);
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

describe('KhepreeAccessService state machine (N04)', () => {
  let tempRoot: string;
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    resetMockKhepreeApiStateForTests();
    for (const key of [
      'KHEPREE_MOCK_DEVICE_LIMIT',
      'KHEPREE_MOCK_NO_ENTITLEMENT',
      'KHEPREE_MOCK_DEVICE_BLOCKED',
      'KHEPREE_MOCK_DEVICE_REMOVED',
      'KHEPREE_MOCK_BAD_LEASE_SIGNATURE',
      'KHEPREE_MOCK_EXPIRED_LEASE',
      'KHEPREE_MOCK_WRONG_PRODUCT',
      'KHEPREE_MOCK_NETWORK_FAIL',
      'KHEPREE_MOCK_ENTITLEMENT_EXPIRED',
      'KHEPREE_MOCK_ENTITLEMENT_SUSPENDED',
    ]) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-khepree-n04-'));
  });

  afterEach(async () => {
    setKhepreeProductAccessEnforcer(null);
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

  it('no session → AUTH_REQUIRED', async () => {
    const { service } = createService(tempRoot);
    const state = await service.initializeOnColdStart();
    expect(state.status).toBe('AUTH_REQUIRED');
    expect(state.signedIn).toBe(false);
    await service.shutdown();
  });

  it('active session cold start → ACTIVE', async () => {
    const first = createService(tempRoot);
    await loginActive(first.service);
    await first.service.shutdown();

    const second = createService(tempRoot);
    let sawValidating = false;
    second.service.subscribe((state) => {
      if (state.status === 'VALIDATING_SESSION') sawValidating = true;
    });
    const cold = await second.service.initializeOnColdStart();
    expect(sawValidating).toBe(true);
    expect(cold.status).toBe('ACTIVE');
    expect(cold.canUseWorkspace).toBe(true);
    await second.service.shutdown();
  });

  it('no entitlement → ENTITLEMENT_MISSING', async () => {
    process.env.KHEPREE_MOCK_NO_ENTITLEMENT = '1';
    const { service } = createService(tempRoot);
    await loginActive(service);
    expect(service.getPublicState().status).toBe('ENTITLEMENT_MISSING');
    expect(service.getPublicState().canUseWorkspace).toBe(false);
    await service.shutdown();
  });

  it('device limit → DEVICE_LIMIT_REACHED', async () => {
    process.env.KHEPREE_MOCK_DEVICE_LIMIT = '1';
    const { service } = createService(tempRoot);
    const loginPromise = service.startLogin();
    await vi.runAllTimersAsync();
    const state = await loginPromise;
    expect(state.status).toBe('DEVICE_LIMIT_REACHED');
    await service.shutdown();
  });

  it('device blocked → DEVICE_BLOCKED on cold start', async () => {
    const first = createService(tempRoot);
    await loginActive(first.service);
    await first.service.shutdown();

    process.env.KHEPREE_MOCK_DEVICE_BLOCKED = '1';
    const second = createService(tempRoot);
    const cold = await second.service.initializeOnColdStart();
    expect(cold.status).toBe('DEVICE_BLOCKED');
    expect(cold.leaseValid).toBe(false);
    await second.service.shutdown();
  });

  it('device removed → DEVICE_REMOVED on cold start', async () => {
    const first = createService(tempRoot);
    await loginActive(first.service);
    await first.service.shutdown();

    process.env.KHEPREE_MOCK_DEVICE_REMOVED = '1';
    const second = createService(tempRoot);
    const cold = await second.service.initializeOnColdStart();
    expect(cold.status).toBe('DEVICE_REMOVED');
    await second.service.shutdown();
  });

  it('bad lease signature → ERROR', async () => {
    const first = createService(tempRoot);
    await loginActive(first.service);
    await first.service.shutdown();

    process.env.KHEPREE_MOCK_BAD_LEASE_SIGNATURE = '1';
    const second = createService(tempRoot);
    const cold = await second.service.initializeOnColdStart();
    expect(cold.status).toBe('ERROR');
    expect(cold.leaseValid).toBe(false);
    await second.service.shutdown();
  });

  it('expired lease → ERROR', async () => {
    const first = createService(tempRoot);
    await loginActive(first.service);
    await first.service.shutdown();

    process.env.KHEPREE_MOCK_EXPIRED_LEASE = '1';
    const second = createService(tempRoot);
    const cold = await second.service.initializeOnColdStart();
    expect(cold.status).toBe('ERROR');
    await second.service.shutdown();
  });

  it('wrong product lease → ERROR', async () => {
    const first = createService(tempRoot);
    await loginActive(first.service);
    await first.service.shutdown();

    process.env.KHEPREE_MOCK_WRONG_PRODUCT = '1';
    const second = createService(tempRoot);
    const cold = await second.service.initializeOnColdStart();
    expect(cold.status).toBe('ERROR');
    await second.service.shutdown();
  });

  it('network fail cold start → OFFLINE_COLD_START without cached lease', async () => {
    const first = createService(tempRoot);
    await loginActive(first.service);
    await first.service.shutdown();

    process.env.KHEPREE_MOCK_NETWORK_FAIL = '1';
    const second = createService(tempRoot);
    const cold = await second.service.initializeOnColdStart();
    expect(cold.status).toBe('OFFLINE_COLD_START');
    expect(cold.leaseValid).toBe(false);
    await second.service.shutdown();
  });

  it('assertProductAccess blocked before ACTIVE', async () => {
    const { service } = createService(tempRoot);
    await service.initializeOnColdStart();
    expect(() => service.assertProductAccess(KHEPREE_FEATURES.translation)).toThrow(
      KhepreeProductAccessDeniedError,
    );
    await service.shutdown();
  });

  it('assertProductAccess allowed when ACTIVE', async () => {
    const { service } = createService(tempRoot);
    await loginActive(service);
    expect(() => service.assertProductAccess(KHEPREE_FEATURES.translation)).not.toThrow();
    await service.shutdown();
  });

  it('invalid refresh clears session → AUTH_REQUIRED', async () => {
    const { service, db } = createService(tempRoot);
    await loginActive(service);
    service['sessionStore'].clearAccessToken();
    const secretStorage = new SecretStorageService({
      backend: createXorBackend(),
      repository: db.secrets,
    });
    await secretStorage.replace({
      secretKey: KHEPREE_SECRET_KEYS.refreshToken,
      plainText: 'invalid-refresh-token',
      kind: 'app_token',
      ownerType: 'khepree_user',
      ownerId: 'invalid',
    });
    const cold = await service.initializeOnColdStart();
    expect(cold.status).toBe('AUTH_REQUIRED');
    await service.shutdown();
  });
});
