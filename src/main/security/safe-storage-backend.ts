/**
 * Abstraction over Electron safeStorage.
 * Prefers async APIs when present; wraps sync APIs as Promises on Electron ≤33.
 * Never provides a plaintext passthrough.
 */

export interface EncryptResult {
  ciphertext: Buffer;
}

export interface DecryptResult {
  plaintext: string;
  /** When true, caller should re-encrypt and replace stored blob (key rotation). */
  shouldReEncrypt: boolean;
}

export interface SafeStorageBackend {
  isAvailable(): Promise<boolean>;
  encrypt(plainText: string): Promise<EncryptResult>;
  decrypt(encrypted: Buffer): Promise<DecryptResult>;
  getBackendName?(): string | null;
}

interface ElectronSafeStorageLike {
  isEncryptionAvailable?: () => boolean;
  encryptString?: (plainText: string) => Buffer;
  decryptString?: (encrypted: Buffer) => string;
  isAsyncEncryptionAvailable?: () => boolean | Promise<boolean>;
  encryptStringAsync?: (plainText: string) => Promise<Buffer>;
  decryptStringAsync?: (
    encrypted: Buffer,
  ) => Promise<{ result?: string; shouldReEncrypt?: boolean; isTemporarilyUnavailable?: boolean }>;
  getSelectedStorageBackend?: () => string;
}

export function createElectronSafeStorageBackend(
  safeStorage: ElectronSafeStorageLike,
): SafeStorageBackend {
  return {
    async isAvailable(): Promise<boolean> {
      if (typeof safeStorage.isAsyncEncryptionAvailable === 'function') {
        return Promise.resolve(safeStorage.isAsyncEncryptionAvailable());
      }
      if (typeof safeStorage.isEncryptionAvailable === 'function') {
        return safeStorage.isEncryptionAvailable();
      }
      return false;
    },

    async encrypt(plainText: string): Promise<EncryptResult> {
      if (typeof safeStorage.encryptStringAsync === 'function') {
        const ciphertext = await safeStorage.encryptStringAsync(plainText);
        return { ciphertext };
      }
      if (typeof safeStorage.encryptString !== 'function') {
        throw new Error('safeStorage.encryptString is not available');
      }
      return { ciphertext: safeStorage.encryptString(plainText) };
    },

    async decrypt(encrypted: Buffer): Promise<DecryptResult> {
      if (typeof safeStorage.decryptStringAsync === 'function') {
        const result = await safeStorage.decryptStringAsync(encrypted);
        if (result.isTemporarilyUnavailable) {
          throw new Error('safeStorage temporarily unavailable');
        }
        if (typeof result.result !== 'string') {
          throw new Error('safeStorage decrypt returned empty result');
        }
        return {
          plaintext: result.result,
          shouldReEncrypt: result.shouldReEncrypt === true,
        };
      }
      if (typeof safeStorage.decryptString !== 'function') {
        throw new Error('safeStorage.decryptString is not available');
      }
      return {
        plaintext: safeStorage.decryptString(encrypted),
        shouldReEncrypt: false,
      };
    },

    getBackendName(): string | null {
      if (typeof safeStorage.getSelectedStorageBackend === 'function') {
        return safeStorage.getSelectedStorageBackend();
      }
      return null;
    },
  };
}
