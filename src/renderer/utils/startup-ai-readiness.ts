/** Issues surfaced on app open — before the user clicks Translate. */
import type { AccountAvailabilityDto } from '@shared/schemas/account-availability';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import {
  reorderProvidersWithPrimary,
  TRANSLATION_AI_PROVIDER_IDS,
} from '@shared/constants/translation-ai-providers';

export type StartupAiIssue =
  | 'no_ai_account'
  | 'no_google_account'
  | 'google_needs_login'
  | 'web_api_not_ready'
  | 'no_ai_provider'
  | 'check_failed';

export interface StartupAiProviderRow {
  id: string;
  status: string;
  enabled: boolean;
}

export interface StartupAiReadinessInput {
  googleAccounts: { availability: AccountAvailabilityDto }[];
  /** Health row for Gemini Web API only (Playwright generic health is always false). */
  webApiHealth: { ok: boolean; status: string; message: string } | null;
  webApiAccounts: { status: string }[];
  workerRunning: boolean;
  /** At least one enabled non-disabled AI provider row. */
  hasEnabledProvider: boolean;
  providerRows?: StartupAiProviderRow[];
  primaryProviderId?: string | null;
  fallbackEnabled?: boolean;
  /** At least one READY ChatGPT/Meta browser account. */
  browserAiReady?: boolean;
}

export type StartupAiReadinessResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: StartupAiIssue[]; detail: string | null };

function upper(value: string | null | undefined): string {
  return (value ?? '').toUpperCase();
}

function isReady(value: string | null | undefined): boolean {
  return upper(value) === 'READY';
}

function isWebApiReady(input: StartupAiReadinessInput): boolean {
  if (input.webApiHealth?.ok) return true;
  const accountReady = input.webApiAccounts.some((a) => isReady(a.status));
  return input.workerRunning && accountReady;
}

function enabledTranslationIds(input: StartupAiReadinessInput): string[] {
  if (input.providerRows?.length) {
    return TRANSLATION_AI_PROVIDER_IDS.filter((id) =>
      input.providerRows?.some((row) => row.id === id && row.enabled) ?? false,
    );
  }
  return input.hasEnabledProvider ? [...TRANSLATION_AI_PROVIDER_IDS] : [];
}

function isPrimaryChannelReady(input: StartupAiReadinessInput): boolean {
  const enabled = enabledTranslationIds(input);
  if (enabled.length === 0) return false;

  const primary =
    input.primaryProviderId && enabled.includes(input.primaryProviderId)
      ? input.primaryProviderId
      : enabled[0];

  const candidates =
    input.fallbackEnabled === false
      ? [primary]
      : reorderProvidersWithPrimary(
          enabled.map((id) => ({ providerId: id })),
          primary,
        ).map((row) => row.providerId);

  for (const providerId of candidates) {
    const row = input.providerRows?.find((p) => p.id === providerId);
    if (row && isReady(row.status)) return true;

    if (providerId === AI_PROVIDER_IDS.GEMINI_WEB_API && isWebApiReady(input)) {
      return true;
    }
    if (
      (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT ||
        providerId === AI_PROVIDER_IDS.PLAYWRIGHT_META_AI) &&
      input.browserAiReady
    ) {
      return true;
    }
    if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI && isReady(row?.status)) {
      return true;
    }
  }

  return false;
}

function geminiPathBlocked(input: StartupAiReadinessInput): boolean {
  const enabled = enabledTranslationIds(input);
  const geminiIds = [
    AI_PROVIDER_IDS.GEMINI_WEB_API,
    AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
  ];
  const geminiEnabled = enabled.some((id) => (geminiIds as readonly string[]).includes(id));
  if (!geminiEnabled) return false;

  const webOk = isWebApiReady(input);
  const browserGeminiOk = input.providerRows?.some(
    (row) => row.id === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI && isReady(row.status),
  );
  return !webOk && !browserGeminiOk;
}

/**
 * Startup gate: at least one configured translation AI channel must be usable.
 * Google account required only when Gemini path is needed and blocked.
 */
export function evaluateStartupAiReadiness(
  input: StartupAiReadinessInput,
): StartupAiReadinessResult {
  if (isPrimaryChannelReady(input)) {
    return { ok: true, issues: [] };
  }

  const issues: StartupAiIssue[] = [];

  if (!input.hasEnabledProvider) {
    issues.push('no_ai_provider');
  } else {
    issues.push('web_api_not_ready');
  }

  if (!input.browserAiReady && !isWebApiReady(input)) {
    const hasAnyGoogle = input.googleAccounts.some(
      (a) => a.availability.availability !== 'PAUSED',
    );
    if (!hasAnyGoogle) {
      issues.push('no_ai_account');
    }
  }

  if (geminiPathBlocked(input)) {
    const enabledGoogle = input.googleAccounts.filter(
      (a) => a.availability.availability !== 'PAUSED',
    );
    if (enabledGoogle.length === 0) {
      issues.push('no_google_account');
    } else if (!enabledGoogle.some((a) => a.availability.usableForNewJob)) {
      if (
        enabledGoogle.some((a) => a.availability.availability === 'LOGIN_REQUIRED')
      ) {
        issues.push('google_needs_login');
      } else {
        issues.push('no_google_account');
      }
    }
  }

  const detail =
    !isPrimaryChannelReady(input) && input.webApiHealth?.message
      ? input.webApiHealth.message
      : null;

  return { ok: false, issues, detail };
}

export const STARTUP_AI_NOTIFY_ID = 'startup-ai-readiness';
