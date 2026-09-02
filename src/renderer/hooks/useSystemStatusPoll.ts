import { useEffect, useRef, useState } from 'react';
import { useNotificationStore } from '../stores/notification-store';
import { t } from '../i18n';
import { shouldNotifyJobTransition } from '../utils/job-notify';

export interface SystemStatus {
  workersReady: number;
  workersTotal: number;
  accountsReady: number;
  jobsRunning: number;
  primaryWorkerEmail: string | null;
  primaryWorkerHealth: string | null;
}

interface WorkerRow {
  id: string;
  accountId: string;
  health: string;
}

interface AccountRow {
  id: string;
  email: string | null;
  status: string;
}

export function useSystemStatusPoll(intervalMs = 4000): SystemStatus {
  const [status, setStatus] = useState<SystemStatus>({
    workersReady: 0,
    workersTotal: 0,
    accountsReady: 0,
    jobsRunning: 0,
    primaryWorkerEmail: null,
    primaryWorkerHealth: null,
  });
  const prevJobs = useRef<Map<string, string>>(new Map());
  const prevAccounts = useRef<Map<string, string>>(new Map());
  const cancelledRef = useRef(false);
  const add = useNotificationStore((s) => s.add);

  useEffect(() => {
    cancelledRef.current = false;

    const tick = async () => {
      try {
        const [workersRes, scheduler, accountsRes, jobsRes, projectsRes] = await Promise.all([
          window.khepreeNovelAI.jobs.workers(),
          window.khepreeNovelAI.jobs.schedulerStatus(),
          window.khepreeNovelAI.accounts.list(),
          window.khepreeNovelAI.jobs.list(undefined),
          window.khepreeNovelAI.projects.list(),
        ]);

        if (cancelledRef.current) return;

        const workers = workersRes.workers as WorkerRow[];
        const accounts = accountsRes.accounts as AccountRow[];
        const accountById = new Map(accounts.map((a) => [a.id, a]));
        const projects = projectsRes.projects;
        const projectName = (id: string) => {
          const found = projects.find((p) => p.id === id);
          return found?.title ?? id;
        };

        const ready = workers.filter(
          (w) => w.health.toUpperCase() === 'READY',
        ).length;
        const accountsReady = accounts.filter(
          (a) => a.status.toUpperCase() === 'READY' || a.status.toUpperCase() === 'BUSY',
        ).length;
        // Prefer a READY worker for the top-bar signal; fall back to first.
        const primary =
          workers.find((w) => w.health.toUpperCase() === 'READY') ??
          workers.find((w) => {
            const acc = accountById.get(w.accountId);
            return acc && (acc.status === 'READY' || acc.status === 'BUSY');
          }) ??
          (workers.length > 0 ? workers[0] : undefined);
        const primaryAccount = primary
          ? accountById.get(primary.accountId)
          : accounts.find((a) => a.status === 'READY' || a.status === 'BUSY') ??
            accounts[0];

        // Prefer account status when worker is stale NEEDS_ATTENTION but account is READY.
        let displayHealth: string | null = primary?.health ?? null;
        if (primaryAccount) {
          const acc = primaryAccount.status.toUpperCase();
          const wh = (displayHealth ?? '').toUpperCase();
          if (
            (acc === 'READY' || acc === 'BUSY') &&
            (wh === 'NEEDS_ATTENTION' || wh === '' || !displayHealth)
          ) {
            displayHealth = primaryAccount.status;
          } else displayHealth ??= primaryAccount.status;
        }

        setStatus({
          workersReady: ready,
          workersTotal: workers.length > 0 ? workers.length : accounts.length,
          accountsReady,
          jobsRunning: scheduler.inFlight,
          primaryWorkerEmail: primaryAccount ? (primaryAccount.email ?? null) : null,
          primaryWorkerHealth: displayHealth,
        });

        const jobs = jobsRes.jobs;
        const nextJobs = new Map<string, string>();
        const nowMs = Date.now();
        for (const job of jobs) {
          nextJobs.set(job.id, job.state);
          const prev = prevJobs.current.get(job.id);
          if (shouldNotifyJobTransition(prev, job.state, job.updatedAt, nowMs)) {
            const name = projectName(job.projectId);
            if (job.state === 'COMPLETED') {
              add({
                kind: 'SUCCESS',
                title: t('notifications.successTranslate'),
                description: t('notifications.successTranslateBody', {
                  from: String(job.chapterFrom ?? ''),
                  to: String(job.chapterTo ?? ''),
                  project: name,
                }),
                projectId: job.projectId,
                projectName: name,
              });
            } else if (job.state === 'FAILED') {
              add({
                kind: 'ERROR',
                title: t('notifications.jobFailed'),
                description: t('notifications.errorContinueBody'),
                projectId: job.projectId,
                projectName: name,
              });
            } else if (job.state === 'NEEDS_ATTENTION') {
              add({
                kind: 'ACTION_REQUIRED',
                title: t('notifications.jobNeedsAttention'),
                description: t('notifications.actionVerifyBody'),
                projectId: job.projectId,
                projectName: name,
              });
            }
          }
        }
        prevJobs.current = nextJobs;

        const nextAccounts = new Map<string, string>();
        for (const acc of accounts) {
          nextAccounts.set(acc.id, acc.status);
          const prev = prevAccounts.current.get(acc.id);
          if (prev && prev !== acc.status && acc.status === 'LOGIN_REQUIRED') {
            add({
              kind: 'ACTION_REQUIRED',
              title: t('notifications.accountLogin'),
              description: t('notifications.actionVerifyBody'),
            });
          }
        }
        prevAccounts.current = nextAccounts;
      } catch {
        // poll best-effort
      }
    };

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, intervalMs);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, [add, intervalMs]);

  return status;
}
