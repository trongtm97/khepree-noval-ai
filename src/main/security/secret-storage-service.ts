import {
  SafeStorageUnavailableError,
  SecretStorageError,
} from './errors';
import type { SafeStorageBackend } from './safe-storage-backend';
import type { SecretsRepository } from '../db/repositories/secrets-repository';
import { logger } from '../logging/logger';

export type SecretKind =
  | 'oauth_refresh'
  | 'oauth_access'
  | 'app_token'
  | 'gemini_web_session'
  | 'other';

export interface SecretRecordMeta {
  id: string;
  secretKey: string;
  kind: SecretKind;
  ownerType: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SecretHealthCheck {
  available: boolean;
  backend: string | null;
  mode: 'async' | 'sync-wrapped' | 'unavailable';
  message: string;
}

export interface SecretStorageServiceOptions {
  backend: SafeStorageBackend;
  repository: SecretsRepository;
  /** Prefer 'async' label when backend exposes async APIs. */
  encryptionMode?: 'async' | 'sync-wrapped';
}

/**
 * Encrypts secrets with OS-backed safeStorage and persists only ciphertext.
 * Never stores Google passwords. Never falls back to plaintext.
 */
export class SecretStorageService {
  private readonly backend: SafeStorageBackend;
  private readonly repository: SecretsRepository;
  private readonly encryptionMode: 'async' | 'sync-wrapped';

  constructor(options: SecretStorageServiceOptions) {
    this.backend = options.backend;
    this.repository = options.repository;
    this.encryptionMode = options.encryptionMode ?? 'sync-wrapped';
  }

  async healthCheck(): Promise<SecretHealthCheck> {
    const available = await this.backend.isAvailable();
    const backend = this.backend.getBackendName?.() ?? null;

    if (!available) {
      return {
        available: false,
        backend,
        mode: 'unavailable',
        message: 'safeStorage encryption is unavailable — secrets cannot be stored',
      };
    }

    return {
      available: true,
      backend,
      mode: this.encryptionMode,
      message: 'safeStorage encryption is available',
    };
  }

  async encrypt(plainText: string): Promise<Buffer> {
    this.assertNonEmptySecret(plainText, 'plainText');
    await this.assertAvailable();

    try {
      const { ciphertext } = await this.backend.encrypt(plainText);
      if (ciphertext.length === 0) {
        throw new SecretStorageError('ENCRYPT_EMPTY', 'Encryption produced empty ciphertext');
      }
      return ciphertext;
    } catch (error) {
      if (error instanceof SafeStorageUnavailableError || error instanceof SecretStorageError) {
        throw error;
      }
      throw new SecretStorageError(
        'ENCRYPT_FAILED',
        error instanceof Error ? error.message : 'Encryption failed',
      );
    }
  }

  async decrypt(ciphertext: Buffer): Promise<string> {
    if (!Buffer.isBuffer(ciphertext) || ciphertext.length === 0) {
      throw new SecretStorageError('DECRYPT_BAD_INPUT', 'Ciphertext must be a non-empty Buffer');
    }
    await this.assertAvailable();

    try {
      const { plaintext, shouldReEncrypt } = await this.backend.decrypt(ciphertext);
      if (typeof plaintext !== 'string') {
        throw new SecretStorageError('DECRYPT_EMPTY', 'Decryption produced empty plaintext');
      }
      if (shouldReEncrypt) {
        logger.info('Secret decrypt indicated key rotation; caller should replace ciphertext');
      }
      return plaintext;
    } catch (error) {
      if (error instanceof SafeStorageUnavailableError || error instanceof SecretStorageError) {
        throw error;
      }
      throw new SecretStorageError(
        'DECRYPT_FAILED',
        error instanceof Error ? error.message : 'Decryption failed',
      );
    }
  }

  /**
   * Encrypt and upsert secret by stable key. Returns metadata only (never plaintext).
   */
  async replace(input: {
    secretKey: string;
    plainText: string;
    kind: SecretKind;
    ownerType?: string | null;
    ownerId?: string | null;
  }): Promise<SecretRecordMeta> {
    this.assertNonEmptySecret(input.secretKey, 'secretKey');
    this.assertNonEmptySecret(input.plainText, 'plainText');

    const ciphertext = await this.encrypt(input.plainText);
    const row = this.repository.upsert({
      secretKey: input.secretKey,
      kind: input.kind,
      ownerType: input.ownerType ?? null,
      ownerId: input.ownerId ?? null,
      encryptedBlob: ciphertext,
    });

    return this.toMeta(row);
  }

  delete(secretKey: string): Promise<boolean> {
    this.assertNonEmptySecret(secretKey, 'secretKey');
    return Promise.resolve(this.repository.deleteByKey(secretKey));
  }

  async getPlainText(secretKey: string): Promise<string | null> {
    this.assertNonEmptySecret(secretKey, 'secretKey');
    const row = this.repository.getByKey(secretKey);
    if (!row) {
      return null;
    }

    const plaintext = await this.decrypt(row.encrypted_blob);

    // Re-encrypt on key rotation signal if decrypt path requested it via backend.
    // (Handled opportunistically by replace when callers detect shouldReEncrypt.)
    return plaintext;
  }

  getMeta(secretKey: string): SecretRecordMeta | null {
    const row = this.repository.getByKey(secretKey);
    return row ? this.toMeta(row) : null;
  }

  private async assertAvailable(): Promise<void> {
    const available = await this.backend.isAvailable();
    if (!available) {
      throw new SafeStorageUnavailableError(
        'Cannot store or read secrets: safeStorage encryption unavailable. Refusing plaintext fallback.',
      );
    }
  }

  private assertNonEmptySecret(value: string, field: string): void {
    if (typeof value !== 'string' || value.length === 0) {
      throw new SecretStorageError('BAD_INPUT', `${field} must be a non-empty string`);
    }
  }

  private toMeta(row: {
    id: string;
    secret_key: string;
    kind: string;
    owner_type: string | null;
    owner_id: string | null;
    created_at: string;
    updated_at: string;
  }): SecretRecordMeta {
    return {
      id: row.id,
      secretKey: row.secret_key,
      kind: row.kind as SecretKind,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
