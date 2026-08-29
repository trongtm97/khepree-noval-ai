import { NOTEBOOK_CHANNEL_READY } from '@shared/constants/notebook';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import {
  reorderProvidersWithPrimary,
  TRANSLATION_AI_PROVIDER_IDS,
} from '@shared/constants/translation-ai-providers';

export type TranslatePreflightReason =
  | 'no_project'
  | 'no_chapter'
  | 'no_paragraphs'
  | 'no_worker'
  | 'no_channel';

export interface TranslatePreflightProviderRow {
  id: string;
  status: string;
  enabled: boolean;
}

export interface TranslatePreflightInput {
  hasProject: boolean;
  hasChapter: boolean;
  paragraphCount: number;
  workers: { health: string; accountId: string }[];
  googleAccounts: { id: string; status: string; workerEnabled?: boolean }[];
  aiAccounts: { status: string; providerId?: string }[];
  browserAiAccounts?: { status: string; providerId?: string }[];
  notebookStatus: string | null;
  /** Enabled AI provider ids — legacy; prefer providerRows. */
  enabledProviderIds?: string[];
  providerRows?: TranslatePreflightProviderRow[];
  primaryProviderId?: string | null;
  fallbackEnabled?: boolean;
  /** Canonical project worker from ProjectWorkerResolver — never first READY. */
  resolvedWorkerAccountId?: string | null;
}

export type TranslatePreflightResult =
  | {
      ok: true;
      webApiReady: boolean;
      notebookReady: boolean;
      workerAccountId: string | null;
    }
  | { ok: false; reason: TranslatePreflightReason };

function upper(value: string | null | undefined): string {
  return (value ?? '').toUpperCase();
}

/** READY or BUSY (browser open for Notebook/Accounts still counts as signed-in worker). */
function isUsableWorkerHealth(value: string | null | undefined): boolean {
  const s = upper(value);
  return s === 'READY' || s === 'BUSY';
}

function isUsableGoogleStatus(value: string | null | undefined): boolean {
  const s = upper(value);
  return s === 'READY' || s === 'BUSY';
}

function isReady(value: string | null | undefined): boolean {
  return upper(value) === 'READY';
}

function enabledTranslationProviderIds(input: TranslatePreflightInput): string[] {
  if (input.providerRows?.length) {
    return TRANSLATION_AI_PROVIDER_IDS.filter((id) =>
      input.providerRows!.some((row) => row.id === id && row.enabled),
    );
  }
  const enabled = input.enabledProviderIds ?? [];
  return TRANSLATION_AI_PROVIDER_IDS.filter((id) => enabled.includes(id));
}

function isProviderChannelReady(providerId: string, input: TranslatePreflightInput): boolean {
  const row = input.providerRows?.find((p) => p.id === providerId);
  if (row && isReady(row.status)) return true;

  if (providerId === AI_PROVIDER_IDS.GEMINI_WEB_API) {
    return input.aiAccounts.some((a) => isReady(a.status));
  }

  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI) {
    return isReady(row?.status);
  }

  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT) {
    return (
      input.browserAiAccounts?.some(
        (a) => (!a.providerId || a.providerId === providerId) && isReady(a.status),
      ) ?? false
    );
  }

  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_META_AI) {
    return (
      input.browserAiAccounts?.some(
        (a) => (!a.providerId || a.providerId === providerId) && isReady(a.status),
      ) ?? false
    );
  }

  return false;
}

function isNotebookChannelReady(input: TranslatePreflightInput): boolean {
  return NOTEBOOK_CHANNEL_READY.has((input.notebookStatus ?? '').toLowerCase());
}

function orderedChannelCandidates(input: TranslatePreflightInput): string[] {
  const enabled = enabledTranslationProviderIds(input);
  if (enabled.length === 0) return [];

  const primary =
    input.primaryProviderId && enabled.includes(input.primaryProviderId)
      ? input.primaryProviderId
      : enabled[0];

  const ordered = reorderProvidersWithPrimary(
    enabled.map((id) => ({ providerId: id })),
    primary,
  ).map((row) => row.providerId);

  if (input.fallbackEnabled === false) {
    return ordered.slice(0, 1);
  }
  return ordered;
}

export function evaluateTranslatePreflight(
  input: TranslatePreflightInput,
): TranslatePreflightResult {
  if (!input.hasProject) return { ok: false, reason: 'no_project' };
  if (!input.hasChapter) return { ok: false, reason: 'no_chapter' };
  if (input.paragraphCount <= 0) return { ok: false, reason: 'no_paragraphs' };

  const usableWorkers = input.workers.filter((w) => isUsableWorkerHealth(w.health));
  const usableGoogle = input.googleAccounts.filter(
    (a) => isUsableGoogleStatus(a.status) && a.workerEnabled !== false,
  );
  if (usableWorkers.length === 0 && usableGoogle.length === 0) {
    return { ok: false, reason: 'no_worker' };
  }

  const resolved = input.resolvedWorkerAccountId ?? null;
  if (!resolved) {
    return { ok: false, reason: 'no_worker' };
  }
  const resolvedUsable =
    usableWorkers.some((w) => w.accountId === resolved) ||
    usableGoogle.some((a) => a.id === resolved);
  if (!resolvedUsable) {
    return { ok: false, reason: 'no_worker' };
  }
  const workerAccountId = resolved;

  const enabledTranslation = enabledTranslationProviderIds(input);

  if (enabledTranslation.length === 0) {
    const enabled = input.enabledProviderIds ?? [];
    const playwrightOnly =
      enabled.includes(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI) &&
      !enabled.includes(AI_PROVIDER_IDS.GEMINI_WEB_API);
    const webApiOnly =
      enabled.includes(AI_PROVIDER_IDS.GEMINI_WEB_API) &&
      !enabled.includes(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI);

    if (playwrightOnly) {
      return {
        ok: true,
        webApiReady: false,
        notebookReady: false,
        workerAccountId,
      };
    }

    const webApiReady = input.aiAccounts.some((a) => isReady(a.status));
    const browserAiReady = (input.browserAiAccounts ?? []).some((a) => isReady(a.status));
    const notebookReady = NOTEBOOK_CHANNEL_READY.has(
      (input.notebookStatus ?? '').toLowerCase(),
    );
    if (webApiOnly && !webApiReady && !browserAiReady) {
      return { ok: false, reason: 'no_channel' };
    }
    if (!webApiReady && !notebookReady && !browserAiReady) {
      return { ok: false, reason: 'no_channel' };
    }

    return {
      ok: true,
      webApiReady: webApiReady || browserAiReady,
      notebookReady,
      workerAccountId,
    };
  }

  if (
    enabledTranslation.length === 1 &&
    enabledTranslation[0] === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI
  ) {
    return {
      ok: true,
      webApiReady: false,
      notebookReady: false,
      workerAccountId,
    };
  }

  const candidates = orderedChannelCandidates(input);
  const anyChannelReady =
    candidates.some((id) => isProviderChannelReady(id, input)) ||
    candidates.some(
      (id) =>
        (id === AI_PROVIDER_IDS.GEMINI_WEB_API ||
          id === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI) &&
        isNotebookChannelReady(input),
    );

  if (!anyChannelReady) {
    return { ok: false, reason: 'no_channel' };
  }

  const webApiReady =
    isProviderChannelReady(AI_PROVIDER_IDS.GEMINI_WEB_API, input) ||
    (input.browserAiAccounts ?? []).some((a) => isReady(a.status));
  const notebookReady = isNotebookChannelReady(input);

  return {
    ok: true,
    webApiReady,
    notebookReady,
    workerAccountId,
  };
}

export const JOB_SUCCESS_STATES = new Set(['COMPLETED', 'ACCEPTED_WITH_WARNINGS']);
export const JOB_FAILURE_STATES = new Set([
  'FAILED',
  'NEEDS_ATTENTION',
  'CANCELLED',
  'SKIPPED',
]);

export function isJobTerminalState(state: string): boolean {
  return JOB_SUCCESS_STATES.has(state) || JOB_FAILURE_STATES.has(state);
}

export type JobWatchTickResult = 'success' | 'failure' | 'pending';

export function evaluateJobWatchTick(state: string): JobWatchTickResult {
  if (JOB_SUCCESS_STATES.has(state)) return 'success';
  if (JOB_FAILURE_STATES.has(state)) return 'failure';
  return 'pending';
}

/** After max stalled polls with non-terminal state, UI must surface timeout. */
export function isJobWatchTimedOut(
  pollsCompleted: number,
  maxPolls: number,
  lastState: string | null,
): boolean {
  if (pollsCompleted < maxPolls) return false;
  if (!lastState) return true;
  return evaluateJobWatchTick(lastState) === 'pending';
}

/**
 * Progress fingerprint for stall detection.
 * Watch UI should not time out while chunks / paragraphs are still advancing.
 * Omits updatedAt so lease heartbeats alone do not reset the stall window.
 */
export function jobWatchProgressKey(job: {
  state: string;
  progress?: {
    phase?: string;
    chunkIndex?: number;
    chunkTotal?: number;
    paragraphsDone?: number;
    paragraphsTotal?: number;
    providerType?: string;
    packMode?: string;
    continuationRound?: number;
    lastCompletedParagraphId?: string | null;
  } | null;
}): string {
  const p = job.progress;
  return [
    job.state,
    p?.phase ?? '',
    p?.chunkIndex ?? '',
    p?.chunkTotal ?? '',
    p?.paragraphsDone ?? '',
    p?.paragraphsTotal ?? '',
    p?.providerType ?? '',
    p?.packMode ?? '',
    p?.continuationRound ?? '',
  ].join('|');
}
