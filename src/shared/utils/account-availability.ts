import type {
  AccountAvailability,
  AccountAvailabilityReason,
  AccountUiLane,
} from '../constants/account-availability';
import type {
  AccountActiveJob,
  AccountAvailabilityDto,
  AccountAvailabilitySummary,
} from '../schemas/account-availability';

export interface AccountAvailabilityInput {
  accountId: string;
  accountStatus: string;
  workerEnabled: boolean;
  workerHealth: string | null;
  workerCurrentJobId: string | null;
  limitedUntil: string | null;
  hasProfile: boolean;
  profileLease: { ownerId: string; operation: string; label: string } | null;
  runtimeHealth: string | null;
  profileLockBlocked: boolean;
  /** True when worker-pool would admit this worker for a new job. */
  schedulerEligible: boolean;
  activeJob: AccountActiveJob | null;
  now?: number;
}

const TERMINAL_ACCOUNT_STATUSES = new Set(['DISABLED']);

function upper(value: string | null | undefined): string {
  return (value ?? '').toUpperCase();
}

function isLimitedActive(limitedUntil: string | null, now: number): boolean {
  if (!limitedUntil) return false;
  const ts = Date.parse(limitedUntil);
  return !Number.isNaN(ts) && ts > now;
}

function isBusyState(input: AccountAvailabilityInput): boolean {
  if (input.activeJob) return true;
  if (upper(input.workerHealth) === 'BUSY') return true;
  if (upper(input.accountStatus) === 'BUSY') return true;
  if (upper(input.runtimeHealth) === 'BUSY') return true;
  if (input.profileLease) {
    const op = input.profileLease.operation;
    if (op === 'manual_browser' || op === 'translation' || input.profileLease.ownerId.startsWith('job:')) {
      return true;
    }
  }
  return false;
}

export function availabilityToUiLane(availability: AccountAvailability): AccountUiLane {
  switch (availability) {
    case 'READY':
      return 'ready';
    case 'BUSY':
      return 'running';
    case 'PAUSED':
      return 'paused';
    case 'LOGIN_REQUIRED':
      return 'login';
    case 'LIMITED':
      return 'limited';
    case 'NEEDS_ATTENTION':
    case 'UNAVAILABLE':
    default:
      return 'attention';
  }
}

/**
 * Canonical account availability — single source of truth for scheduler + UI.
 * Main process supplies schedulerEligible / activeJob / lock probes; pure logic here.
 */
export function resolveAccountAvailability(input: AccountAvailabilityInput): AccountAvailabilityDto {
  const now = input.now ?? Date.now();
  const accountStatus = upper(input.accountStatus);
  const workerHealth = upper(input.workerHealth);

  let availability: AccountAvailability;
  let reasonCode: AccountAvailabilityReason | null = null;

  if (accountStatus === 'LOGIN_REQUIRED' || accountStatus === 'NEW') {
    availability = 'LOGIN_REQUIRED';
    reasonCode = 'login_required';
  } else if (accountStatus === 'NEEDS_ATTENTION') {
    availability = 'NEEDS_ATTENTION';
    reasonCode = 'needs_attention';
  } else if (!input.workerEnabled) {
    availability = 'PAUSED';
    reasonCode = 'worker_disabled';
  } else if (isBusyState(input)) {
    availability = 'BUSY';
    reasonCode = input.activeJob
      ? 'active_job'
      : input.profileLease
        ? 'profile_lease'
        : upper(input.accountStatus) === 'BUSY'
          ? 'account_busy'
          : 'worker_busy';
  } else if (workerHealth === 'NEEDS_ATTENTION') {
    availability = 'NEEDS_ATTENTION';
    reasonCode = 'needs_attention';
  } else if (
    accountStatus === 'LIMITED' ||
    workerHealth === 'LIMITED' ||
    isLimitedActive(input.limitedUntil, now)
  ) {
    availability = 'LIMITED';
    reasonCode = 'quota_limited';
  } else if (TERMINAL_ACCOUNT_STATUSES.has(accountStatus) || workerHealth === 'DISABLED' || workerHealth === 'OFFLINE') {
    availability = 'UNAVAILABLE';
    reasonCode = accountStatus === 'DISABLED' ? 'disabled' : 'session_invalid';
  } else if (!input.hasProfile) {
    availability = 'UNAVAILABLE';
    reasonCode = 'profile_missing';
  } else if (input.profileLockBlocked) {
    availability = 'NEEDS_ATTENTION';
    reasonCode = 'profile_locked';
  } else if (upper(input.runtimeHealth) === 'NEEDS_ATTENTION') {
    availability = 'NEEDS_ATTENTION';
    reasonCode = 'session_invalid';
  } else if (input.schedulerEligible) {
    availability = 'READY';
    reasonCode = null;
  } else if (accountStatus === 'READY' || accountStatus === 'BUSY') {
    // Session looks signed-in but worker-pool excludes (e.g. stale state) — attention not ready.
    availability = 'NEEDS_ATTENTION';
    reasonCode = 'session_invalid';
  } else {
    availability = 'UNAVAILABLE';
    reasonCode = 'session_invalid';
  }

  const busy = availability === 'BUSY';
  const usableForNewJob = availability === 'READY';
  const autoRetryExpected =
    availability === 'LIMITED' && isLimitedActive(input.limitedUntil, now);

  return {
    availability,
    uiLane: availabilityToUiLane(availability),
    reasonCode,
    usableForNewJob,
    schedulerEligible: input.schedulerEligible,
    canOpenBrowser: !input.profileLockBlocked || busy,
    canPause: input.workerEnabled && availability !== 'PAUSED',
    canRemove: !busy,
    autoRetryExpected,
    activeJob: busy ? input.activeJob : null,
  };
}

export function computeAvailabilitySummary(
  items: Array<{ availability: AccountAvailabilityDto }>,
): AccountAvailabilitySummary {
  const summary: AccountAvailabilitySummary = {
    ready: 0,
    busy: 0,
    paused: 0,
    needsAttention: 0,
  };
  for (const { availability: a } of items) {
    switch (a.availability) {
      case 'READY':
        summary.ready += 1;
        break;
      case 'BUSY':
        summary.busy += 1;
        break;
      case 'PAUSED':
        summary.paused += 1;
        break;
      default:
        summary.needsAttention += 1;
        break;
    }
  }
  return summary;
}

export function countUsableForNewJob(
  items: Array<{ availability: AccountAvailabilityDto }>,
): number {
  return items.filter((i) => i.availability.usableForNewJob).length;
}

export function formatAvailabilityPreflightMessage(
  items: Array<{ availability: AccountAvailabilityDto; label?: string }>,
): string | null {
  const login = items.filter((i) => i.availability.availability === 'LOGIN_REQUIRED').length;
  const attention = items.filter(
    (i) =>
      i.availability.availability === 'NEEDS_ATTENTION' ||
      i.availability.availability === 'UNAVAILABLE',
  ).length;
  const limited = items.filter((i) => i.availability.availability === 'LIMITED').length;
  const paused = items.filter((i) => i.availability.availability === 'PAUSED').length;
  const busy = items.filter((i) => i.availability.availability === 'BUSY').length;
  const ready = items.filter((i) => i.availability.usableForNewJob).length;

  if (ready > 0) return null;

  const parts: string[] = [];
  if (login > 0) {
    parts.push(
      login === 1
        ? '1 tài khoản cần đăng nhập lại.'
        : `${login} tài khoản cần đăng nhập lại.`,
    );
  }
  if (attention > 0) {
    parts.push(
      attention === 1
        ? '1 tài khoản cần xử lý.'
        : `${attention} tài khoản cần xử lý.`,
    );
  }
  if (limited > 0) {
    parts.push(
      limited === 1
        ? '1 tài khoản đang tạm giới hạn.'
        : `${limited} tài khoản đang tạm giới hạn.`,
    );
  }
  if (paused > 0 && parts.length === 0) {
    parts.push(
      paused === 1
        ? 'Tài khoản đang tạm dừng.'
        : `${paused} tài khoản đang tạm dừng.`,
    );
  }
  if (busy > 0 && parts.length === 0) {
    parts.push(
      busy === 1
        ? 'Tài khoản đang bận.'
        : `${busy} tài khoản đang bận.`,
    );
  }
  if (parts.length === 0) {
    return 'Chưa có tài khoản Google sẵn sàng.';
  }
  return parts.join(' ');
}

export const AVAILABILITY_SORT_RANK: Record<AccountAvailability, number> = {
  NEEDS_ATTENTION: 0,
  LOGIN_REQUIRED: 0,
  UNAVAILABLE: 0,
  BUSY: 1,
  READY: 2,
  LIMITED: 3,
  PAUSED: 4,
};
