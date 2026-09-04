import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import type { GoogleAccountDto } from '@shared/schemas/account';
import { getUsableWorkerCount, countUsableAccounts } from '@shared/utils/worker-usability';
import type { AiPreference } from '@shared/constants/ai-preference';
import { DEFAULT_AI_PREFERENCE } from '@shared/constants/ai-preference';
import { useT } from '../../i18n';
import {
  type SchedulerSnap,
  type WorkerRow,
  countPausedJobs,
  countWaitingJobs,
  groupQueuedByProject,
  projectTitle,
  selectAttentionJobs,
  selectRecentJobs,
  selectRunningJobs,
} from './jobs-utils';

const POLL_IDLE_MS = 10_000;
const POLL_ACTIVE_MS = 4_000;

export interface JobsOverviewData {
  projects: ProjectDto[];
  accounts: GoogleAccountDto[];
  jobs: JobDto[];
  workers: WorkerRow[];
  scheduler: SchedulerSnap | null;
  loading: boolean;
  refreshError: string | null;
  runningJobs: JobDto[];
  attentionJobs: JobDto[];
  recentJobs: JobDto[];
  queuedByProject: [string, JobDto[]][];
  waitingCount: number;
  pausedCount: number;
  usableWorkers: number;
  runningCount: number;
  aiPreference: import('@shared/constants/ai-preference').AiPreference;
  titleFor: (projectId: string) => string;
  accountById: Map<string, GoogleAccountDto>;
  jobById: Map<string, JobDto>;
  refresh: () => Promise<void>;
}

export function useJobsOverview(): JobsOverviewData {
  const t = useT();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [accounts, setAccounts] = useState<GoogleAccountDto[]>([]);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerSnap | null>(null);
  const [aiPreference, setAiPreference] = useState<AiPreference>(DEFAULT_AI_PREFERENCE);
  const [aiReadyProviders, setAiReadyProviders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      window.khepreeNovelAI.projects.list(),
      window.khepreeNovelAI.accounts.list(),
      window.khepreeNovelAI.jobs.list(undefined),
      window.khepreeNovelAI.jobs.schedulerStatus(),
      window.khepreeNovelAI.jobs.workers(),
      window.khepreeNovelAI.aiProviders.getRouting(),
      window.khepreeNovelAI.aiProviders.autoSetupStatus(),
    ]);
    if (!aliveRef.current) return;

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length === results.length) {
      const first = failures[0];
      const msg =
        first.reason instanceof Error
          ? first.reason.message
          : t('errors.UNKNOWN.title');
      setRefreshError(msg);
      return;
    }

    if (failures.length > 0) {
      setRefreshError(t('jobs.partialRefreshWarning'));
    } else {
      setRefreshError(null);
    }

    const [projectResult, accountResult, jobResult, status, workerResult, routingResult, aiStatusResult] =
      results;

    if (projectResult.status === 'fulfilled') {
      setProjects(
        Array.isArray(projectResult.value.projects) ? projectResult.value.projects : [],
      );
    }
    if (accountResult.status === 'fulfilled') {
      setAccounts(
        Array.isArray(accountResult.value.accounts) ? accountResult.value.accounts : [],
      );
    }
    if (jobResult.status === 'fulfilled') {
      setJobs(Array.isArray(jobResult.value.jobs) ? jobResult.value.jobs : []);
    }
    if (status.status === 'fulfilled') {
      setScheduler({
        running: status.value.running,
        paused: status.value.paused,
        inFlight: status.value.inFlight,
        maxConcurrent: status.value.maxConcurrent,
        perProjectMax: status.value.perProjectMax,
        allowSameProjectParallel: status.value.allowSameProjectParallel,
      });
    }
    if (workerResult.status === 'fulfilled') {
      setWorkers(
        Array.isArray(workerResult.value.workers) ? workerResult.value.workers : [],
      );
    }
    if (routingResult.status === 'fulfilled') {
      setAiPreference(routingResult.value.aiPreference);
    }
    if (aiStatusResult.status === 'fulfilled') {
      const health = aiStatusResult.value.providerHealth;
      setAiReadyProviders(
        Array.isArray(health) ? health.filter((row) => row.ok).length : 0,
      );
    }
  }, [t]);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        if (!aliveRef.current) return;
        setRefreshError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => {
        if (!aliveRef.current) return;
        setInitialLoadDone(true);
        setLoading(false);
      });
  }, [refresh, t]);

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const titleFor = useCallback(
    (id: string) => projectTitle(projects, id),
    [projects],
  );

  const runningJobs = useMemo(() => selectRunningJobs(jobs), [jobs]);
  const attentionJobs = useMemo(() => selectAttentionJobs(jobs), [jobs]);
  const recentJobs = useMemo(() => selectRecentJobs(jobs), [jobs]);
  const queuedByProject = useMemo(
    () => groupQueuedByProject(jobs, titleFor),
    [jobs, titleFor],
  );
  const waitingCount = useMemo(() => countWaitingJobs(jobs), [jobs]);
  const pausedCount = useMemo(() => countPausedJobs(jobs), [jobs]);
  const hasActiveWork = useMemo(
    () =>
      runningJobs.length > 0 ||
      waitingCount > 0 ||
      pausedCount > 0 ||
      (scheduler?.inFlight ?? 0) > 0,
    [runningJobs.length, waitingCount, pausedCount, scheduler?.inFlight],
  );

  useEffect(() => {
    if (!initialLoadDone) return;

    const pollMs = hasActiveWork ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    const id = window.setInterval(() => {
      void refresh().catch(() => {
        /* poll best-effort */
      });
    }, pollMs);

    return () => {
      window.clearInterval(id);
    };
  }, [refresh, hasActiveWork, initialLoadDone]);

  const usableWorkers = useMemo(() => {
    const googleUsable =
      accounts.length > 0
        ? countUsableAccounts(accounts)
        : getUsableWorkerCount(workers, accountById);
    return Math.max(googleUsable, aiReadyProviders);
  }, [workers, accountById, accounts, aiReadyProviders]);
  const runningCount = scheduler?.inFlight ?? runningJobs.length;

  return {
    projects,
    accounts,
    jobs,
    workers,
    scheduler,
    loading,
    refreshError,
    runningJobs,
    attentionJobs,
    recentJobs,
    queuedByProject,
    waitingCount,
    pausedCount,
    usableWorkers,
    runningCount,
    aiPreference,
    titleFor,
    accountById,
    jobById,
    refresh,
  };
}
