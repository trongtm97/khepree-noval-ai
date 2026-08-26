/**
 * Errors for local secret encryption. Never fall back to plaintext storage.
 */
export class SafeStorageUnavailableError extends Error {
  readonly code = 'SAFE_STORAGE_UNAVAILABLE' as const;

  constructor(message = 'Electron safeStorage encryption is unavailable') {
    super(message);
    this.name = 'SafeStorageUnavailableError';
  }
}

export class SecretStorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SecretStorageError';
    this.code = code;
  }
}
