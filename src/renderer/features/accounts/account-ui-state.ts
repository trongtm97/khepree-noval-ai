import type { GoogleAccountDto } from '@shared/schemas/account';
import type { GoogleAccountPlan } from '@shared/constants/google-account';
import type { AccountUiLane } from '@shared/constants/account-availability';
import {
  AVAILABILITY_SORT_RANK,
  computeAvailabilitySummary,
} from '@shared/utils/account-availability';

/** Canonical user-facing account state — from main-process `availability.uiLane`. */
export type AccountUiState = AccountUiLane;

export type AccountFilter = 'all' | 'ready' | 'busy' | 'attention' | 'paused';

export interface AccountSummaryCounts {
  ready: number;
  busy: number;
  paused: number;
  needsAttention: number;
}

/** Single primary status — never re-derive from raw status/worker fields. */
export function resolveAccountUiState(account: GoogleAccountDto): AccountUiState {
  return account.availability.uiLane;
}

export function computeAccountSummary(accounts: GoogleAccountDto[]): AccountSummaryCounts {
  return computeAvailabilitySummary(
    accounts.map((account) => ({ availability: account.availability })),
  );
}

export function sortAccounts(accounts: GoogleAccountDto[]): GoogleAccountDto[] {
  return [...accounts].sort((a, b) => {
    const ra = AVAILABILITY_SORT_RANK[a.availability.availability];
    const rb = AVAILABILITY_SORT_RANK[b.availability.availability];
    if (ra !== rb) return ra - rb;
    const aUsed = Date.parse(a.lastUsedAt ?? '') || 0;
    const bUsed = Date.parse(b.lastUsedAt ?? '') || 0;
    return bUsed - aUsed;
  });
}

export function matchesAccountFilter(
  account: GoogleAccountDto,
  filter: AccountFilter,
  query = '',
): boolean {
  if (filter !== 'all') {
    const lane = resolveAccountUiState(account);
    if (filter === 'ready' && lane !== 'ready') return false;
    if (filter === 'busy' && lane !== 'running') return false;
    if (filter === 'paused' && lane !== 'paused') return false;
    if (filter === 'attention' && lane !== 'login' && lane !== 'limited' && lane !== 'attention') {
      return false;
    }
  }
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { title, subtitle } = resolveAccountIdentity(account, '');
  const hay = [title, subtitle, account.email, account.label, account.displayName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

const AUTO_LABEL_RE = /^Google Account [0-9a-f]{8}$/i;

export function resolveAccountIdentity(
  account: GoogleAccountDto,
  fallbackTitle: string,
): { title: string; subtitle: string | null } {
  const email = account.email?.trim() || null;
  const displayName = account.displayName?.trim() || null;
  const label = account.label?.trim() || null;

  let title: string;
  if (label && !AUTO_LABEL_RE.test(label)) {
    title = label;
  } else if (displayName && displayName !== email) {
    title = displayName;
  } else if (email) {
    title = email;
  } else {
    title = fallbackTitle;
  }

  const subtitle = email && email !== title ? email : null;
  return { title, subtitle };
}

export function planLabelKey(plan: GoogleAccountPlan): string {
  const map: Record<GoogleAccountPlan, string> = {
    UNKNOWN: 'accounts.planUnknown',
    FREE: 'accounts.planFree',
    PLUS: 'accounts.planPlus',
    PRO: 'accounts.planPro',
    ULTRA: 'accounts.planUltra',
  };
  return map[plan];
}

export function isBrowserSecurityError(message: string): boolean {
  return /BROWSER_NOT_SECURE|không an toàn|may not be secure|Chromium Playwright|NTS_BROWSER_ENGINE/i.test(
    message,
  );
}
