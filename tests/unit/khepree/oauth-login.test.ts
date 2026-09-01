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
import { KHEPREE_OAUTH_REDIRECT_URI, KHEPREE_PRODUCT_SLUG, KHEPREE_SECRET_KEYS } from '@shared/constants/khepree';
import { getKhepreeOAuthClientId } from '@main/khepree/config';

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
  return { service: new KhepreeAccessService(() => db, secretStorage), db };
}

describe('KhepreeAccessService OAuth login', () => {
  let tempRoot: string;

  beforeEach(() => {
    vi.useFakeTimers();
    resetMockKhepreeApiStateForTests();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-khepree-oauth-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Windows lock
    }
  });

  it('fresh install shows login without session', async () => {
    const { service } = createService(tempRoot);
    const state = await service.initializeOnColdStart();
    expect(state.status).toBe('AUTH_REQUIRED');
    expect(state.signedIn).toBe(false);
    await service.shutdown();
  });

  it('completes browser login and stores encrypted refresh token', async () => {
    const { service, db } = createService(tempRoot);
    const loginPromise = service.startLogin();
    await vi.runAllTimersAsync();
    const state = await loginPromise;
    expect(state.status).toBe('ACTIVE');
    expect(state.signedIn).toBe(true);

    const row = db.secrets.getByKey('khepree.session.refresh_token');
    expect(row).not.toBeNull();
    expect(row?.encrypted_blob.toString('utf8')).not.toContain('mock-refresh');
    await service.shutdown();
  });

  it('reopen with saved session enters validating then workspace', async () => {
    const first = createService(tempRoot);
    const loginPromise = first.service.startLogin();
    await vi.runAllTimersAsync();
    await loginPromise;
    await first.service.shutdown();

    const second = createService(tempRoot);
    let sawValidating = false;
    second.service.subscribe((state) => {
      if (state.status === 'VALIDATING_SESSION') sawValidating = true;
    });
    const cold = await second.service.initializeOnColdStart();
    expect(sawValidating).toBe(true);
    expect(cold.status).toBe('ACTIVE');
    await second.service.shutdown();
  });

  it('invalid refresh on cold start clears session and requires login', async () => {
    const { service, db } = createService(tempRoot);
    const loginPromise = service.startLogin();
    await vi.runAllTimersAsync();
    await loginPromise;

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
    expect(cold.signedIn).toBe(false);
    await service.shutdown();
  });

  it('mock exchange rejects PKCE mismatch', async () => {
    const { service } = createService(tempRoot);
    const identity = await service['deviceIdentity'].getIdentity();
    const api = service['api'];
    await api.startDeviceAuth({
      state: 'state-pkce',
      codeChallenge: 'valid-challenge-placeholder-0123456789012345678901234567890',
      codeChallengeMethod: 'S256',
      redirectUri: KHEPREE_OAUTH_REDIRECT_URI,
      installationId: identity.installationId,
      devicePublicKey: identity.publicKeySpki,
      productId: KHEPREE_PRODUCT_SLUG,
    });

    await expect(
      api.exchangeDeviceAuth({
        code: 'mock-code-bad',
        state: 'state-pkce',
        codeVerifier: 'wrong-verifier-012345678901234567890123456789012345678901',
        clientId: getKhepreeOAuthClientId(),
        redirectUri: KHEPREE_OAUTH_REDIRECT_URI,
        installationId: identity.installationId,
        devicePublicKey: identity.publicKeySpki,
        platform: 'win32',
        appVersion: '0.1.0-test',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return error instanceof Error && 'code' in error && (error as { code: string }).code === 'OAUTH_PKCE_FAILED';
    });
    await service.shutdown();
  });
});
