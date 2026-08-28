import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import type { GoogleAccountDto } from '@shared/schemas/account';
import { getUsableWorkerCount, countUsableAccounts } from '@shared/utils/worker-usability';
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

const POLL_MS = 10_000;

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
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      window.novelTrans.projects.list(),
      window.novelTrans.accounts.list(),
      window.novelTrans.jobs.list(undefined),
      window.novelTrans.jobs.schedulerStatus(),
      window.novelTrans.jobs.workers(),
    ]);

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length === results.length) {
      const first = failures[0];
      const msg =
        first.status === 'rejected'
          ? first.reason instanceof Error
            ? first.reason.message
            : t('errors.UNKNOWN.title')
          : t('errors.UNKNOWN.title');
      setRefreshError(msg);
      return;
    }

    if (failures.length > 0) {
      setRefreshError(t('jobs.partialRefreshWarning'));
    } else {
      setRefreshError(null);
    }

    const [projectResult, accountResult, jobResult, status, workerResult] = results;

    if (projectResult.status === 'fulfilled') {
      setProjects(projectResult.value.projects);
    }
    if (accountResult.status === 'fulfilled') {
      setAccounts(accountResult.value.accounts);
    }
    if (jobResult.status === 'fulfilled') {
      setJobs(jobResult.value.jobs);
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
      setWorkers(workerResult.value.workers as WorkerRow[]);
    }
  }, [t]);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        setRefreshError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => {
        initialLoadDone.current = true;
        setLoading(false);
      });

    const id = window.setInterval(() => {
      void refresh().catch(() => {
        /* poll best-effort */
      });
    }, POLL_MS);

    return () => {
      window.clearInterval(id);
    };
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
  const usableWorkers = useMemo(
    () =>
      accounts.length > 0
        ? countUsableAccounts(accounts)
        : getUsableWorkerCount(workers, accountById),
    [workers, accountById, accounts],
  );
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
    titleFor,
    accountById,
    jobById,
    refresh,
  };
}
