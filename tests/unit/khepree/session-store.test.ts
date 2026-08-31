import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import { resolveAppPaths } from '@main/services/paths-service';
import { SecretStorageService } from '@main/security/secret-storage-service';
import type { SafeStorageBackend } from '@main/security/safe-storage-backend';
import { KhepreeSessionStore } from '@main/khepree/session-store';
import { KHEPREE_SECRET_KEYS } from '@shared/constants/khepree';
import {
  KhepreeCredentialCorruptError,
  KhepreeSafeStorageRequiredError,
} from '@main/khepree/errors';

function createXorBackend(available = true, corruptDecrypt = false): SafeStorageBackend {
  return {
    isAvailable() {
      return Promise.resolve(available);
    },
    encrypt(plainText: string) {
      const buf = Buffer.from(plainText, 'utf8');
      for (let i = 0; i < buf.length; i += 1) {
        buf[i] ^= 0x5a;
      }
      return Promise.resolve({ ciphertext: buf });
    },
    decrypt(encrypted: Buffer) {
      if (corruptDecrypt) {
        return Promise.reject(new Error('decrypt failed'));
      }
      const buf = Buffer.from(encrypted);
      for (let i = 0; i < buf.length; i += 1) {
        buf[i] ^= 0x5a;
      }
      return Promise.resolve({ plaintext: buf.toString('utf8'), shouldReEncrypt: false });
    },
    getBackendName() {
      return 'test-xor';
    },
  };
}

describe('KhepreeSessionStore', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-khepree-session-'));
  });

  afterEach(() => {
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Windows file lock
    }
  });

  function createStore(backend: SafeStorageBackend): KhepreeSessionStore {
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.data, { recursive: true });
    fs.mkdirSync(paths.backups, { recursive: true });
    closeDatabase();
    const db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    const secretStorage = new SecretStorageService({
      backend,
      repository: db.secrets,
    });
    return new KhepreeSessionStore(secretStorage);
  }

  it('keeps access token in memory only', async () => {
    const store = createStore(createXorBackend(true));
    store.setAccessToken('access-secret', 3600, 'user-1');
    expect(store.getAccessToken()).toBe('access-secret');
    expect(store.getSnapshot().hasAccessToken).toBe(true);
  });

  it('returns null when no refresh token exists', async () => {
    const store = createStore(createXorBackend(true));
    await expect(store.loadRefreshToken()).resolves.toBeNull();
  });

  it('round-trips encrypted refresh token', async () => {
    const store = createStore(createXorBackend(true));
    await store.saveRefreshToken('refresh-secret', 'user-1');
    await expect(store.loadRefreshToken()).resolves.toBe('refresh-secret');
  });

  it('throws CREDENTIAL_CORRUPT when encrypted refresh token cannot decrypt', async () => {
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    const db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    const goodStorage = new SecretStorageService({
      backend: createXorBackend(true),
      repository: db.secrets,
    });
    await goodStorage.replace({
      secretKey: KHEPREE_SECRET_KEYS.refreshToken,
      plainText: 'refresh-secret',
      kind: 'app_token',
      ownerType: 'khepree_user',
      ownerId: 'user-1',
    });

    const corruptStore = new KhepreeSessionStore(
      new SecretStorageService({
        backend: createXorBackend(true, true),
        repository: db.secrets,
      }),
    );
    await expect(corruptStore.loadRefreshToken()).rejects.toBeInstanceOf(
      KhepreeCredentialCorruptError,
    );
  });

  it('throws SAFE_STORAGE_UNAVAILABLE when saving without encryption backend', async () => {
    const store = createStore(createXorBackend(false));
    await expect(store.saveRefreshToken('refresh-secret', 'user-1')).rejects.toBeInstanceOf(
      KhepreeSafeStorageRequiredError,
    );
  });

  it('throws SAFE_STORAGE_UNAVAILABLE when loading with unavailable backend', async () => {
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.data, { recursive: true });
    fs.mkdirSync(paths.backups, { recursive: true });
    closeDatabase();
    const db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    const goodStorage = new SecretStorageService({
      backend: createXorBackend(true),
      repository: db.secrets,
    });
    await goodStorage.replace({
      secretKey: KHEPREE_SECRET_KEYS.refreshToken,
      plainText: 'refresh-secret',
      kind: 'app_token',
      ownerType: 'khepree_user',
      ownerId: 'user-1',
    });

    const store = new KhepreeSessionStore(
      new SecretStorageService({
        backend: createXorBackend(false),
        repository: db.secrets,
      }),
    );
    await expect(store.loadRefreshToken()).rejects.toBeInstanceOf(
      KhepreeSafeStorageRequiredError,
    );
  });
});
