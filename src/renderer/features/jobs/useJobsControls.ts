import { useCallback, useState } from 'react';
import type { JobAttemptDto } from '@shared/schemas/job';
import { useT } from '../../i18n';
import { JOB_PRIORITY, type JobBulkAction, type PriorityBand } from './jobs-utils';

export function useJobsControls(refresh: () => Promise<void>) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(() => new Set());
  const [pendingBulkAction, setPendingBulkAction] = useState<JobBulkAction | null>(null);
  const [attempts, setAttempts] = useState<JobAttemptDto[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);

  const toggleJobSelection = useCallback((jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  const selectAllJobs = useCallback((jobIds: string[]) => {
    setSelectedJobIds(new Set(jobIds));
  }, []);

  const clearJobSelection = useCallback(() => {
    setSelectedJobIds(new Set());
  }, []);

  const openJob = useCallback(
    async (jobId: string) => {
      setSelectedId(jobId);
      setDrawerOpen(true);
      setShowAdvanced(false);
      setError(null);
      try {
        const detail = await window.novelTrans.jobs.get(jobId);
        setAttempts(detail.attempts);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      }
    },
    [t],
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const runControl = useCallback(
    async (fn: () => Promise<{ message?: string } | undefined>) => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const result = await fn();
        if (result && typeof result === 'object' && 'message' in result && result.message) {
          setMessage(result.message);
        }
        await refresh();
        if (selectedId) {
          const detail = await window.novelTrans.jobs.get(selectedId);
          setAttempts(detail.attempts);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      } finally {
        setBusy(false);
      }
    },
    [refresh, selectedId, t],
  );

  const setJobPriority = useCallback(
    async (jobId: string, band: PriorityBand) => {
      await runControl(async () => {
        await window.novelTrans.jobs.move(jobId, JOB_PRIORITY[band]);
        return { message: t('jobs.priorityUpdated') };
      });
    },
    [runControl, t],
  );

  const setProjectQueuePriority = useCallback(
    async (jobIds: string[], band: PriorityBand) => {
      if (jobIds.length === 0) return;
      await runControl(async () => {
        for (const jobId of jobIds) {
          await window.novelTrans.jobs.move(jobId, JOB_PRIORITY[band]);
        }
        return { message: t('jobs.priorityUpdated') };
      });
    },
    [runControl, t],
  );

  const pauseAll = useCallback(async () => {
    await runControl(async () => {
      const r = await window.novelTrans.jobs.pauseAll();
      return { message: r.affected ? t('jobs.pauseAllDone') : undefined };
    });
  }, [runControl, t]);

  const resumeAll = useCallback(async () => {
    await runControl(async () => {
      const r = await window.novelTrans.jobs.resumeAll();
      return { message: r.affected ? t('jobs.resumeAllDone') : undefined };
    });
  }, [runControl, t]);

  const retryJob = useCallback(
    async (jobId: string) => {
      await runControl(async () => {
        await window.novelTrans.jobs.retry(jobId);
        return { message: t('jobs.retryDone') };
      });
    },
    [runControl, t],
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      await runControl(async () => {
        await window.novelTrans.jobs.cancel(jobId);
        setCancelJobId(null);
        return { message: t('jobs.cancelDone') };
      });
    },
    [runControl, t],
  );

  const requestCancel = useCallback((jobId: string) => {
    setCancelJobId(jobId);
  }, []);

  const requestBulkAction = useCallback((action: JobBulkAction) => {
    if (selectedJobIds.size === 0) return;
    setPendingBulkAction(action);
  }, [selectedJobIds.size]);

  const confirmBulkAction = useCallback(async () => {
    const action = pendingBulkAction;
    if (!action || selectedJobIds.size === 0) return;
    const jobIds = [...selectedJobIds];
    await runControl(async () => {
      const result = await window.novelTrans.jobs.bulk({ jobIds, action });
      setPendingBulkAction(null);
      clearJobSelection();
      return { message: result.message };
    });
  }, [pendingBulkAction, selectedJobIds, runControl, clearJobSelection]);

  const cancelBulkAction = useCallback(() => {
    setPendingBulkAction(null);
  }, []);

  return {
    selectedId,
    selectedJobIds,
    pendingBulkAction,
    attempts,
    drawerOpen,
    showAdvanced,
    setShowAdvanced,
    busy,
    error,
    setError,
    message,
    setMessage,
    cancelJobId,
    openJob,
    closeDrawer,
    runControl,
    setJobPriority,
    setProjectQueuePriority,
    pauseAll,
    resumeAll,
    retryJob,
    cancelJob,
    requestCancel,
    setCancelJobId,
    toggleJobSelection,
    selectAllJobs,
    clearJobSelection,
    requestBulkAction,
    confirmBulkAction,
    cancelBulkAction,
  };
}
