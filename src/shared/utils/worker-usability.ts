/** Renderer-side mirror of main-process account availability (from DTO). */

import type { AccountAvailabilityDto } from '@shared/schemas/account-availability';

export interface WorkerUsabilitySnap {
  id: string;
  accountId: string;
  health: string;
  limitedUntil: string | null;
}

export interface AccountUsabilitySnap {
  id: string;
  status: string;
  workerEnabled: boolean;
  availability?: AccountAvailabilityDto;
}

export function isUsableWorker(
  worker: WorkerUsabilitySnap,
  account: AccountUsabilitySnap | undefined,
  now = Date.now(),
): boolean {
  if (account?.availability) {
    return account.availability.usableForNewJob;
  }
  // Legacy fallback when availability missing (tests/mocks).
  if (!account?.workerEnabled) return false;

  const health = worker.health.toUpperCase();
  if (
    health === 'DISABLED' ||
    health === 'OFFLINE' ||
    health === 'BUSY' ||
    health === 'NEEDS_ATTENTION'
  ) {
    return false;
  }

  if (health === 'LIMITED') {
    if (worker.limitedUntil && Date.parse(worker.limitedUntil) > now) return false;
  } else if (health !== 'READY') {
    return false;
  }

  const status = account.status.toUpperCase();
  if (
    status === 'DISABLED' ||
    status === 'NEEDS_ATTENTION' ||
    status === 'LOGIN_REQUIRED'
  ) {
    return false;
  }

  return true;
}

export function getUsableWorkerCount(
  workers: WorkerUsabilitySnap[],
  accountById: Map<string, AccountUsabilitySnap>,
  now = Date.now(),
): number {
  return workers.filter((w) => isUsableWorker(w, accountById.get(w.accountId), now)).length;
}

export function countUsableAccounts(
  accounts: { availability: AccountAvailabilityDto }[],
): number {
  return accounts.filter((a) => a.availability.usableForNewJob).length;
}
