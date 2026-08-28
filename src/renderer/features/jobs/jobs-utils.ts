import type { JobDto } from '@shared/schemas/job';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { ProjectDto } from '@shared/schemas/import';
import { isJobActive, isJobAttention } from '@shared/utils/job-progress';
import { detectErrorCode } from '../../i18n/errors';

/** Lower number = higher scheduler priority (ORDER BY priority ASC). */
export const JOB_PRIORITY = {
  high: 10,
  normal: 100,
  low: 500,
} as const;

export type PriorityBand = keyof typeof JOB_PRIORITY;

export interface WorkerRow {
  id: string;
  accountId: string;
  health: string;
  priority: number;
  currentJobId: string | null;
  limitedUntil: string | null;
  lastError: string | null;
}

export interface SchedulerSnap {
  running: boolean;
  paused: boolean;
  inFlight: number;
  maxConcurrent: number;
  perProjectMax: number;
  allowSameProjectParallel: boolean;
}

export function priorityBand(priority: number): PriorityBand {
  if (priority <= 50) return 'high';
  if (priority <= 200) return 'normal';
  return 'low';
}

export function isWaitingState(state: string): boolean {
  return state === 'QUEUED' || state === 'WAITING_WORKER';
}

export function isPausedJobState(state: string): boolean {
  return state === 'PAUSED';
}

export function isQueuedForDisplay(state: string): boolean {
  return isWaitingState(state) || isPausedJobState(state);
}

export function isRunningJobState(state: string): boolean {
  return isJobActive(state) && !isWaitingState(state) && !isPausedJobState(state);
}

const TERMINAL_RECENT_STATES = new Set([
  'COMPLETED',
  'ACCEPTED_WITH_WARNINGS',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
]);

export function friendlyChannel(job: JobDto | null): string | null {
  if (!job?.progress) return null;
  const packMode = job.progress.packMode;
  const provider = (job.progress.providerType ?? '').toUpperCase();
  if (
    packMode === 'notebook_assisted' &&
    (provider.includes('NOTEBOOK') || job.progress.notebookId || job.progress.notebookName)
  ) {
    return 'Notebook';
  }
  if (
    provider.includes('WEB') ||
    provider.includes('PLAYWRIGHT') ||
    provider.includes('GEMINI')
  ) {
    return 'Gemini';
  }
  return null;
}

export function knowledgeLabel(job: JobDto | null): string | null {
  if (!job?.progress) return null;
  const v =
    job.progress.localKnowledgeVersion ??
    job.progress.knowledgeVersion ??
    job.progress.notebookVerifiedVersion;
  if (typeof v !== 'number') return null;
  return `Knowledge v${v}`;
}

export function chapterRange(job: JobDto | null): string | null {
  if (job?.chapterFrom == null) return null;
  if (job.chapterTo != null && job.chapterTo !== job.chapterFrom) {
    return `${job.chapterFrom}–${job.chapterTo}`;
  }
  return String(job.chapterFrom);
}

export function paragraphProgressLabel(job: JobDto | null): string | null {
  if (!job) return null;
  const done = job.progress?.paragraphsDone;
  const total = job.progress?.paragraphsTotal;
  if (typeof done === 'number' && typeof total === 'number' && total > 0) {
    return `${done} / ${total}`;
  }
  return null;
}

export function accountDisplayName(
  account: GoogleAccountDto | undefined,
  stableIndex: number,
  fallbackLabel: string,
): string {
  const label = account?.label?.trim();
  if (label) return label;
  const display = account?.displayName?.trim();
  if (display) return display;
  const email = account?.email?.trim();
  if (email) return email;
  return fallbackLabel.replace('{n}', String(stableIndex + 1));
}

export function projectTitle(projects: ProjectDto[], id: string): string {
  return projects.find((p) => p.id === id)?.title ?? id.slice(0, 8);
}

export function findLaneJob(
  worker: WorkerRow,
  jobById: Map<string, JobDto>,
  allJobs: JobDto[],
): JobDto | null {
  if (worker.currentJobId) {
    const byId = jobById.get(worker.currentJobId);
    if (byId) return byId;
  }
  return (
    allJobs.find((j) => {
      const accountMatch =
        j.progress?.accountId === worker.accountId ||
        j.pinnedAccountId === worker.accountId;
      if (!accountMatch) return false;
      if (isQueuedForDisplay(j.state)) return false;
      return !TERMINAL_RECENT_STATES.has(j.state);
    }) ?? null
  );
}

export type AccountLaneStatus =
  | 'running'
  | 'ready'
  | 'limited'
  | 'attention'
  | 'paused'
  | 'login';

export function accountLaneStatus(
  worker: WorkerRow,
  account: GoogleAccountDto | undefined,
): AccountLaneStatus {
  if (account?.workerEnabled === false) return 'paused';
  const accountStatus = (account?.status ?? '').toUpperCase();
  if (accountStatus === 'LOGIN_REQUIRED') return 'login';
  if (accountStatus === 'NEEDS_ATTENTION') return 'attention';

  const h = worker.health.toUpperCase();
  if (h === 'BUSY') return 'running';
  if (h === 'READY') return 'ready';
  if (h === 'LIMITED') return 'limited';
  if (h === 'DISABLED' || h === 'OFFLINE') return 'paused';
  return 'attention';
}

export function sortWorkers(workers: WorkerRow[]): WorkerRow[] {
  return [...workers].sort((a, b) => {
    const rank = (w: WorkerRow) => {
      const k = accountLaneStatus(w, undefined);
      if (k === 'running') return 0;
      if (k === 'attention' || k === 'login') return 1;
      if (k === 'limited') return 2;
      if (k === 'ready') return 3;
      return 4;
    };
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return a.priority - b.priority;
  });
}

export function groupQueuedByProject(
  jobs: JobDto[],
  titleFor: (projectId: string) => string,
): [string, JobDto[]][] {
  const map = new Map<string, JobDto[]>();
  for (const job of jobs) {
    if (!isQueuedForDisplay(job.state)) continue;
    const list = map.get(job.projectId) ?? [];
    list.push(job);
    map.set(job.projectId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (a.chapterFrom ?? 0) - (b.chapterFrom ?? 0);
    });
  }
  return [...map.entries()].sort((a, b) => {
    const aPri = a[1][0]?.priority ?? 999;
    const bPri = b[1][0]?.priority ?? 999;
    if (aPri !== bPri) return aPri - bPri;
    return titleFor(a[0]).localeCompare(titleFor(b[0]));
  });
}

export function selectRunningJobs(jobs: JobDto[]): JobDto[] {
  return jobs.filter((j) => isRunningJobState(j.state));
}

export function selectAttentionJobs(jobs: JobDto[]): JobDto[] {
  return jobs.filter((j) => isJobAttention(j.state));
}

export function selectRecentJobs(jobs: JobDto[], limit = 10): JobDto[] {
  return jobs
    .filter((j) => TERMINAL_RECENT_STATES.has(j.state))
    .sort((a, b) => {
      const aTs = Date.parse(a.completedAt ?? a.updatedAt);
      const bTs = Date.parse(b.completedAt ?? b.updatedAt);
      return bTs - aTs;
    })
    .slice(0, limit);
}

export function countWaitingJobs(jobs: JobDto[]): number {
  return jobs.filter((j) => isWaitingState(j.state)).length;
}

export function countPausedJobs(jobs: JobDto[]): number {
  return jobs.filter((j) => isPausedJobState(j.state)).length;
}

export function friendlyJobSummary(
  job: JobDto,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const code = detectErrorCode(job.error);
  if (code === 'LOGIN_REQUIRED') return t('jobs.friendly.loginRequired');
  if (code === 'CAPTCHA') return t('jobs.friendly.captcha');
  if (code === 'QUOTA_LIMIT') return t('jobs.friendly.quota');
  if (code === 'NETWORK_ERROR') return t('jobs.friendly.network');
  if (code === 'RESPONSE_TIMEOUT') return t('jobs.friendly.timeout');
  if (job.state === 'FAILED' || job.state === 'NEEDS_ATTENTION') {
    const done = job.progress?.paragraphsDone;
    if (typeof done === 'number' && done > 0) {
      return t('jobs.friendly.interruptedAt', { n: String(done) });
    }
    return t('jobs.friendly.needsAttention');
  }
  return t('jobs.friendly.needsAttention');
}

export function jobSupportsPartialResume(job: JobDto): boolean {
  const done = job.progress?.paragraphsDone;
  return (
    (job.state === 'FAILED' || job.state === 'NEEDS_ATTENTION') &&
    typeof done === 'number' &&
    done > 0
  );
}
