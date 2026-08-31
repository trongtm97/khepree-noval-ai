import { AI_PROVIDER_IDS, type AiProviderType } from '@shared/constants/ai-provider';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { AiAccountDto } from '@shared/schemas/ai-provider';
import type { AccountActiveJob } from '@shared/schemas/account-availability';
import type { AccountUiLane } from '@shared/constants/account-availability';
import { resolveAccountIdentity, planLabelKey } from './account-ui-state';

/** User-facing provider bucket for filters and cards. */
export type AiAccountProviderKind = 'gemini' | 'chatgpt' | 'meta';

export type ProviderFilter = 'all' | AiAccountProviderKind;

export interface AiAccountViewModel {
  id: string;
  providerId: string;
  providerType: AiProviderType | 'GOOGLE_GEMINI';
  providerKind: AiAccountProviderKind;
  providerLabelKey: string;
  displayName: string;
  subtitle: string | null;
  email: string | null;
  statusLane: AccountUiLane;
  rawStatus: string;
  lastUsedAt: string | null;
  activeJob: AccountActiveJob | null;
  planKey: string | null;
  canPause: boolean;
  canDelete: boolean;
  canRemove: boolean;
  profileDir: string | null;
  lastError: string | null;
  assignedProjectCount: number;
  source:
    | { kind: 'google'; account: GoogleAccountDto }
    | { kind: 'ai'; account: AiAccountDto };
}

const PROVIDER_LABEL_KEYS: Record<AiAccountProviderKind, string> = {
  gemini: 'accounts.providerGemini',
  chatgpt: 'accounts.providerChatGpt',
  meta: 'accounts.providerMetaAi',
};

export function providerKindFromProviderId(providerId: string): AiAccountProviderKind {
  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT) return 'chatgpt';
  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_META_AI) return 'meta';
  return 'gemini';
}

/** Settings / jobs deep link to unified accounts page with optional provider filter. */
export function accountsRouteForProvider(
  kind?: AiAccountProviderKind | null,
): string {
  if (!kind) return '/accounts';
  return `/accounts?provider=${kind}`;
}

export function providerKindFromTranslationProviderId(
  providerId: string,
): AiAccountProviderKind | null {
  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT) return 'chatgpt';
  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_META_AI) return 'meta';
  if (
    providerId === AI_PROVIDER_IDS.GEMINI_WEB_API ||
    providerId === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI
  ) {
    return 'gemini';
  }
  return null;
}

function mapAiStatusToLane(status: AiAccountDto['status']): AccountUiLane {
  switch (status) {
    case 'READY':
      return 'ready';
    case 'LOGIN_REQUIRED':
      return 'login';
    case 'DISABLED':
      return 'paused';
    case 'ERROR':
    default:
      return 'attention';
  }
}

export function googleAccountToViewModel(
  account: GoogleAccountDto,
  fallbackTitle: string,
): AiAccountViewModel {
  const { title, subtitle } = resolveAccountIdentity(account, fallbackTitle);
  return {
    id: account.id,
    providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
    providerType: 'PLAYWRIGHT_GEMINI',
    providerKind: 'gemini',
    providerLabelKey: PROVIDER_LABEL_KEYS.gemini,
    displayName: title,
    subtitle,
    email: account.email,
    statusLane: account.availability.uiLane,
    rawStatus: account.status,
    lastUsedAt: account.lastUsedAt,
    activeJob: account.availability.activeJob ?? null,
    planKey: planLabelKey(account.plan),
    canPause: account.availability.canPause,
    canDelete: account.availability.canRemove,
    canRemove: account.availability.canRemove,
    profileDir: account.browserProfilePath,
    lastError: null,
    assignedProjectCount: account.assignedProjects.length,
    source: { kind: 'google', account },
  };
}

export function aiAccountToViewModel(account: AiAccountDto): AiAccountViewModel {
  const kind = providerKindFromProviderId(account.providerId);
  const displayName =
    account.displayName?.trim() ||
    account.googleEmail?.trim() ||
    account.id.slice(0, 8);
  const email = account.googleEmail?.trim() || null;
  return {
    id: account.id,
    providerId: account.providerId,
    providerType: account.providerType ?? 'PLAYWRIGHT_CHATGPT',
    providerKind: kind,
    providerLabelKey: PROVIDER_LABEL_KEYS[kind],
    displayName,
    subtitle: kind === 'gemini' ? email : tSubtitleForBrowser(displayName, email),
    email,
    statusLane: mapAiStatusToLane(account.status),
    rawStatus: account.status,
    lastUsedAt: account.lastUsedAt,
    activeJob: null,
    planKey: null,
    canPause: account.status !== 'DISABLED',
    canDelete: true,
    canRemove: true,
    profileDir: account.profileDirName ?? null,
    lastError: account.lastError,
    assignedProjectCount: 0,
    source: { kind: 'ai', account },
  };
}

function tSubtitleForBrowser(displayName: string, email: string | null): string | null {
  if (email && email !== displayName) return email;
  return null;
}

const LANE_SORT: Record<AccountUiLane, number> = {
  login: 0,
  attention: 1,
  limited: 2,
  running: 3,
  ready: 4,
  paused: 5,
};

export function sortAccountViewModels(accounts: AiAccountViewModel[]): AiAccountViewModel[] {
  return [...accounts].sort((a, b) => {
    const ra = LANE_SORT[a.statusLane];
    const rb = LANE_SORT[b.statusLane];
    if (ra !== rb) return ra - rb;
    const aUsed = Date.parse(a.lastUsedAt ?? '') || 0;
    const bUsed = Date.parse(b.lastUsedAt ?? '') || 0;
    return bUsed - aUsed;
  });
}

export function computeUnifiedSummary(accounts: AiAccountViewModel[]): {
  ready: number;
  busy: number;
  paused: number;
  needsAttention: number;
} {
  let ready = 0;
  let busy = 0;
  let paused = 0;
  let needsAttention = 0;
  for (const account of accounts) {
    switch (account.statusLane) {
      case 'ready':
        ready += 1;
        break;
      case 'running':
        busy += 1;
        break;
      case 'paused':
        paused += 1;
        break;
      case 'login':
      case 'limited':
      case 'attention':
        needsAttention += 1;
        break;
      default:
        break;
    }
  }
  return { ready, busy, paused, needsAttention };
}

export function matchesProviderFilter(
  account: AiAccountViewModel,
  filter: ProviderFilter,
): boolean {
  if (filter === 'all') return true;
  return account.providerKind === filter;
}

export function matchesAccountSearch(account: AiAccountViewModel, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    account.displayName,
    account.subtitle,
    account.email,
    account.providerKind,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function matchesStatusFilter(
  account: AiAccountViewModel,
  filter: import('./account-ui-state').AccountFilter,
): boolean {
  if (filter === 'all') return true;
  const lane = account.statusLane;
  if (filter === 'ready') return lane === 'ready';
  if (filter === 'busy') return lane === 'running';
  if (filter === 'paused') return lane === 'paused';
  if (filter === 'attention') {
    return lane === 'login' || lane === 'limited' || lane === 'attention';
  }
  return true;
}

export function openSiteLabelKey(kind: AiAccountProviderKind): string {
  switch (kind) {
    case 'chatgpt':
      return 'accounts.openChatGpt';
    case 'meta':
      return 'accounts.openMetaAi';
    default:
      return 'accounts.openGemini';
  }
}
