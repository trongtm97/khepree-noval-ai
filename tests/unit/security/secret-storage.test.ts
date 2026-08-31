import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import { resolveAppPaths } from '@main/services/paths-service';
import { SecretStorageService } from '@main/security/secret-storage-service';
import {
  SafeStorageUnavailableError,
  SecretStorageError,
} from '@main/security/errors';
import type { SafeStorageBackend } from '@main/security/safe-storage-backend';
import { createElectronSafeStorageBackend } from '@main/security/safe-storage-backend';
import { AuditLogService } from '@main/security/audit-log-service';
import { sanitizeAuditMetadata } from '@main/db/repositories/audit-log-repository';

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

describe('SecretStorageService', () => {
  let tempRoot: string;
  let dataDir: string;
  let backupsDir: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'Khepree Novel AI-sec-'));
    const paths = resolveAppPaths(tempRoot);
    dataDir = paths.data;
    backupsDir = paths.backups;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('encrypts and decrypts round-trip', async () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const service = new SecretStorageService({
      backend: createXorBackend(true),
      repository: db.secrets,
    });

    const ciphertext = await service.encrypt('oauth-refresh-token-value');
    expect(Buffer.isBuffer(ciphertext)).toBe(true);
    expect(ciphertext.toString('utf8')).not.toContain('oauth-refresh');

    const plaintext = await service.decrypt(ciphertext);
    expect(plaintext).toBe('oauth-refresh-token-value');
    db.close();
  });

  it('replace stores only encrypted blob and decrypts via getPlainText', async () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const service = new SecretStorageService({
      backend: createXorBackend(true),
      repository: db.secrets,
    });

    const meta = await service.replace({
      secretKey: 'oauth:account-1:refresh',
      plainText: 'refresh-token-secret',
      kind: 'oauth_refresh',
      ownerType: 'google_account',
      ownerId: 'account-1',
    });

    expect(meta.secretKey).toBe('oauth:account-1:refresh');
    const row = db.secrets.getByKey(meta.secretKey);
    expect(row).not.toBeNull();
    expect(row?.encrypted_blob.toString('utf8')).not.toContain('refresh-token-secret');

    const plain = await service.getPlainText(meta.secretKey);
    expect(plain).toBe('refresh-token-secret');

    await service.replace({
      secretKey: 'oauth:account-1:refresh',
      plainText: 'rotated-token',
      kind: 'oauth_refresh',
      ownerType: 'google_account',
      ownerId: 'account-1',
    });
    expect(await service.getPlainText(meta.secretKey)).toBe('rotated-token');

    expect(await service.delete(meta.secretKey)).toBe(true);
    expect(await service.getPlainText(meta.secretKey)).toBeNull();
    db.close();
  });

  it('refuses plaintext when safeStorage unavailable', async () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const service = new SecretStorageService({
      backend: createXorBackend(false),
      repository: db.secrets,
    });

    const health = await service.healthCheck();
    expect(health.available).toBe(false);

    await expect(service.encrypt('secret')).rejects.toBeInstanceOf(
      SafeStorageUnavailableError,
    );
    await expect(
      service.replace({
        secretKey: 'k',
        plainText: 'v',
        kind: 'app_token',
      }),
    ).rejects.toBeInstanceOf(SafeStorageUnavailableError);
    db.close();
  });

  it('rejects bad input', async () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const service = new SecretStorageService({
      backend: createXorBackend(true),
      repository: db.secrets,
    });

    await expect(service.encrypt('')).rejects.toBeInstanceOf(SecretStorageError);
    await expect(service.decrypt(Buffer.alloc(0))).rejects.toBeInstanceOf(
      SecretStorageError,
    );
    await expect(
      service.replace({ secretKey: '', plainText: 'x', kind: 'other' }),
    ).rejects.toBeInstanceOf(SecretStorageError);
    db.close();
  });

  it('createElectronSafeStorageBackend wraps sync API as async', async () => {
    const backend = createElectronSafeStorageBackend({
      isEncryptionAvailable: () => true,
      encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
      decryptString: (buf) => buf.toString('utf8').replace(/^enc:/, ''),
    });

    expect(await backend.isAvailable()).toBe(true);
    const { ciphertext } = await backend.encrypt('hello');
    expect(ciphertext.toString('utf8')).toBe('enc:hello');
    const { plaintext } = await backend.decrypt(ciphertext);
    expect(plaintext).toBe('hello');
  });
});

describe('AuditLog', () => {
  let tempRoot: string;
  let dataDir: string;
  let backupsDir: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'Khepree Novel AI-audit-'));
    const paths = resolveAppPaths(tempRoot);
    dataDir = paths.data;
    backupsDir = paths.backups;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('records required audit events and redacts sensitive metadata', () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const audit = new AuditLogService(db.auditLog, db.appMeta);

    audit.accountAdded('acc-1', 'Work');
    audit.accountRemoved('acc-1', 'Work');
    audit.projectDeleted('proj-1', 'Novel');
    audit.credentialsChanged('oauth:acc-1:refresh', 'oauth_refresh', 'acc-1');
    audit.translationStarted('job-1', 'proj-1');
    audit.exportPerformed('proj-1', 'epub');

    const events = audit.listRecent(20);
    expect(events.length).toBe(6);
    expect(events.map((e) => e.event_type).sort()).toEqual(
      [
        'account_added',
        'account_removed',
        'credentials_changed',
        'export',
        'project_deleted',
        'translation_started',
      ].sort(),
    );

    const redacted = sanitizeAuditMetadata({
      refresh_token: 'secret',
      cookie: 'abc',
      projectId: 'p1',
    });
    expect(redacted).toEqual({
      refresh_token: '[REDACTED]',
      cookie: '[REDACTED]',
      projectId: 'p1',
    });

    expect(audit.isDiagnosticContentLoggingEnabled()).toBe(false);
    db.close();
  });
});
