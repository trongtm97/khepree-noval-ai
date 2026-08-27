import { NOTEBOOK_CHANNEL_READY } from '@shared/constants/notebook';

export type TranslatePreflightReason =
  | 'no_project'
  | 'no_chapter'
  | 'no_paragraphs'
  | 'no_worker'
  | 'no_channel';

export interface TranslatePreflightInput {
  hasProject: boolean;
  hasChapter: boolean;
  paragraphCount: number;
  workers: { health: string; accountId: string }[];
  googleAccounts: { id: string; status: string; workerEnabled?: boolean }[];
  aiAccounts: { status: string }[];
  notebookStatus: string | null;
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
  const workerAccountId =
    resolved ??
    usableWorkers.find((w) => isReady(w.health))?.accountId ??
    usableWorkers.at(0)?.accountId ??
    usableGoogle.find((a) => isReady(a.status))?.id ??
    usableGoogle.at(0)?.id ??
    null;

  const webApiReady = input.aiAccounts.some((a) => isReady(a.status));
  const notebookReady = NOTEBOOK_CHANNEL_READY.has(
    (input.notebookStatus ?? '').toLowerCase(),
  );
  if (!webApiReady && !notebookReady) {
    return { ok: false, reason: 'no_channel' };
  }

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
