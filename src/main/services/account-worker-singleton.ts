import { getDatabase } from '../db/connection';
import { getAuditLog, getSecretStorage } from '../security';
import { AccountWorkerService } from './account-worker-service';

let accountWorker: AccountWorkerService | null = null;

export function initializeAccountWorkerService(
  overrides?: ConstructorParameters<typeof AccountWorkerService>[0],
): AccountWorkerService {
  if (overrides) {
    accountWorker = new AccountWorkerService(overrides);
    return accountWorker;
  }

  const db = getDatabase();
  accountWorker = new AccountWorkerService({
    accounts: db.googleAccounts,
    auditLog: getAuditLog(),
    secretStorage: getSecretStorage(),
  });
  return accountWorker;
}

export function getAccountWorkerService(): AccountWorkerService {
  if (!accountWorker) {
    throw new Error('AccountWorkerService not initialized');
  }
  return accountWorker;
}

export function resetAccountWorkerServiceForTests(): void {
  accountWorker = null;
}
