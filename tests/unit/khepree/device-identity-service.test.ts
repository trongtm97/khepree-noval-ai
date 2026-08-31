import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import { resolveAppPaths } from '@main/services/paths-service';
import { SecretStorageService } from '@main/security/secret-storage-service';
import type { SafeStorageBackend } from '@main/security/safe-storage-backend';
import { DeviceIdentityService } from '@main/khepree/device-identity-service';
import { KHEPREE_SECRET_KEYS } from '@shared/constants/khepree';
import {
  KhepreeCredentialCorruptError,
  KhepreeSafeStorageRequiredError,
} from '@main/khepree/errors';

function createXorBackend(available = true): SafeStorageBackend {
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

describe('DeviceIdentityService', () => {
  let tempRoot: string;
  let secretStorage: SecretStorageService;
  let getDb: () => ReturnType<typeof createDatabaseManager>;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-khepree-device-'));
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.data, { recursive: true });
    fs.mkdirSync(paths.backups, { recursive: true });
    closeDatabase();
    const db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    getDb = () => db;
    secretStorage = new SecretStorageService({
      backend: createXorBackend(true),
      repository: db.secrets,
    });
  });

  afterEach(() => {
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Windows file lock
    }
  });

  it('generates installationId and Ed25519 keypair on first use', async () => {
    const service = new DeviceIdentityService(getDb, secretStorage);
    expect(service.hasStoredPrivateKey()).toBe(false);

    const identity = await service.getIdentity();
    expect(identity.installationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(identity.publicKeySpki.length).toBeGreaterThan(20);
    expect(service.hasStoredPrivateKey()).toBe(true);
  });

  it('reloads the same keypair after restart', async () => {
    const service = new DeviceIdentityService(getDb, secretStorage);
    const first = await service.getIdentity();
    const second = await service.getIdentity();
    expect(second.installationId).toBe(first.installationId);
    expect(second.publicKeySpki).toBe(first.publicKeySpki);
  });

  it('throws CREDENTIAL_CORRUPT when stored private key is invalid — no silent re-gen', async () => {
    const service = new DeviceIdentityService(getDb, secretStorage);
    await secretStorage.replace({
      secretKey: KHEPREE_SECRET_KEYS.devicePrivateKey,
      plainText: 'not-a-valid-pkcs8-key',
      kind: 'other',
      ownerType: 'khepree_device',
      ownerId: 'test-install',
    });

    await expect(service.getOrCreateKeypair()).rejects.toBeInstanceOf(
      KhepreeCredentialCorruptError,
    );
    expect(service.hasStoredPrivateKey()).toBe(true);
  });

  it('requires safeStorage before generating a new keypair', async () => {
    const db = getDb();
    const unavailableStorage = new SecretStorageService({
      backend: createXorBackend(false),
      repository: db.secrets,
    });
    const service = new DeviceIdentityService(getDb, unavailableStorage);
    await expect(service.getOrCreateKeypair()).rejects.toBeInstanceOf(
      KhepreeSafeStorageRequiredError,
    );
  });

  it('persists valid generated key as encrypted secret', async () => {
    const service = new DeviceIdentityService(getDb, secretStorage);
    await service.getOrCreateKeypair();
    const row = getDb().secrets.getByKey(KHEPREE_SECRET_KEYS.devicePrivateKey);
    expect(row).not.toBeNull();
    expect(row?.encrypted_blob.toString('utf8')).not.toContain('BEGIN');

    const { privateKey } = generateKeyPairSync('ed25519');
    const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    expect(pkcs8).not.toBe(row?.encrypted_blob.toString('base64'));
  });
});
