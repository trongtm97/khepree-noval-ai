/** Issues surfaced on app open — before the user clicks Translate. */
import type { AccountAvailabilityDto } from '@shared/schemas/account-availability';

export type StartupAiIssue =
  | 'no_google_account'
  | 'google_needs_login'
  | 'web_api_not_ready'
  | 'no_ai_provider'
  | 'check_failed';

export interface StartupAiReadinessInput {
  googleAccounts: { availability: AccountAvailabilityDto }[];
  /** Health row for Gemini Web API only (Playwright generic health is always false). */
  webApiHealth: { ok: boolean; status: string; message: string } | null;
  webApiAccounts: { status: string }[];
  workerRunning: boolean;
  /** At least one enabled non-disabled AI provider row. */
  hasEnabledProvider: boolean;
}

export type StartupAiReadinessResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: StartupAiIssue[]; detail: string | null };

function upper(value: string | null | undefined): string {
  return (value ?? '').toUpperCase();
}

function isWebApiReady(input: StartupAiReadinessInput): boolean {
  if (input.webApiHealth?.ok) return true;
  const accountReady = input.webApiAccounts.some((a) => upper(a.status) === 'READY');
  return input.workerRunning && accountReady;
}

/**
 * Lightweight startup gate: Google session + at least one usable AI channel signal.
 * Uses canonical account availability — not raw account.status.
 */
export function evaluateStartupAiReadiness(
  input: StartupAiReadinessInput,
): StartupAiReadinessResult {
  const issues: StartupAiIssue[] = [];
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

  if (!input.hasEnabledProvider) {
    issues.push('no_ai_provider');
  } else if (!isWebApiReady(input)) {
    issues.push('web_api_not_ready');
  }

  if (issues.length === 0) {
    return { ok: true, issues: [] };
  }

  const detail =
    !isWebApiReady(input) && input.webApiHealth?.message
      ? input.webApiHealth.message
      : null;

  return { ok: false, issues, detail };
}

export const STARTUP_AI_NOTIFY_ID = 'startup-ai-readiness';
