import { safeStorage } from 'electron';
import { createElectronSafeStorageBackend } from './safe-storage-backend';
import { SecretStorageService } from './secret-storage-service';
import { AuditLogService } from './audit-log-service';
import { getDatabase } from '../db/connection';
import { logger } from '../logging/logger';

let secretStorage: SecretStorageService | null = null;
let auditLog: AuditLogService | null = null;

function detectEncryptionMode(): 'async' | 'sync-wrapped' {
  const storage = safeStorage as unknown as {
    encryptStringAsync?: unknown;
    isAsyncEncryptionAvailable?: unknown;
  };
  if (
    typeof storage.encryptStringAsync === 'function' ||
    typeof storage.isAsyncEncryptionAvailable === 'function'
  ) {
    return 'async';
  }
  return 'sync-wrapped';
}

export function initializeSecurityServices(): {
  secretStorage: SecretStorageService;
  auditLog: AuditLogService;
} {
  const db = getDatabase();
  const mode = detectEncryptionMode();
  const backend = createElectronSafeStorageBackend(safeStorage);

  secretStorage = new SecretStorageService({
    backend,
    repository: db.secrets,
    encryptionMode: mode,
  });
  auditLog = new AuditLogService(db.auditLog, db.appMeta);

  logger.info('Security services initialized', { encryptionMode: mode });
  return { secretStorage, auditLog };
}

export function getSecretStorage(): SecretStorageService {
  if (!secretStorage) {
    throw new Error('SecretStorageService not initialized');
  }
  return secretStorage;
}

export function getAuditLog(): AuditLogService {
  if (!auditLog) {
    throw new Error('AuditLogService not initialized');
  }
  return auditLog;
}

export function resetSecurityServicesForTests(): void {
  secretStorage = null;
  auditLog = null;
}

export { SecretStorageService } from './secret-storage-service';
export { AuditLogService } from './audit-log-service';
export { SafeStorageUnavailableError, SecretStorageError } from './errors';
export { createElectronSafeStorageBackend } from './safe-storage-backend';
