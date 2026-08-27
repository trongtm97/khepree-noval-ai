import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { JobAttemptDto, JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import type { GoogleAccountDto } from '@shared/schemas/account';
import { measureJobProgress, isJobAttention } from '@shared/utils/job-progress';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import { statusLabel } from '../i18n/status';
import { helpArticleForErrorCode } from '../features/help/content';
import {
  PageHeader,
  Button,
  Card,
  EmptyState,
  Drawer,
  ProgressBar,
  ErrorPanel,
  Select,
  Skeleton,
  SectionHeader,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';

interface WorkerRow {
  id: string;
  accountId: string;
  health: string;
  priority: number;
  currentJobId: string | null;
  limitedUntil: string | null;
  lastError: string | null;
}

interface SchedulerSnap {
  running: boolean;
  paused: boolean;
  inFlight: number;
  maxConcurrent: number;
  perProjectMax: number;
  allowSameProjectParallel: boolean;
}

/** Lower number = higher scheduler priority (ORDER BY priority ASC). */
const PRIORITY = {
  high: 10,
  normal: 100,
  low: 500,
} as const;

type PriorityBand = keyof typeof PRIORITY;

function priorityBand(priority: number): PriorityBand {
  if (priority <= 50) return 'high';
  if (priority <= 200) return 'normal';
  return 'low';
}

function isQueuedState(state: string): boolean {
  return state === 'QUEUED' || state === 'WAITING_WORKER' || state === 'PAUSED';
}

function friendlyChannel(job: JobDto | null): string | null {
  if (!job?.progress) return null;
  const p = (job.progress.providerType ?? '').toUpperCase();
  if (p.includes('PLAYWRIGHT') || p.includes('NOTEBOOK')) return 'Gemini Notebook';
  if (p.includes('WEB')) return 'Gemini Web';
  if (job.progress.notebookName) return 'Gemini Notebook';
  return null;
}

function knowledgeLabel(job: JobDto | null): string | null {
  if (!job?.progress) return null;
  const v =
    job.progress.localKnowledgeVersion ??
    job.progress.knowledgeVersion ??
    job.progress.notebookVerifiedVersion;
  if (typeof v !== 'number') return null;
  return `Knowledge v${v}`;
}

function paragraphProgress(job: JobDto | null): string | null {
  if (!job) return null;
  const done = job.progress?.paragraphsDone;
  const total = job.progress?.paragraphsTotal;
  if (typeof done === 'number' && typeof total === 'number' && total > 0) {
    return `${done} / ${total}`;
  }
  return null;
}

function chapterRange(job: JobDto | null): string | null {
  if (!job || job.chapterFrom == null) return null;
  if (job.chapterTo != null && job.chapterTo !== job.chapterFrom) {
    return `${job.chapterFrom}–${job.chapterTo}`;
  }
  return String(job.chapterFrom);
}

function accountDisplayName(account: GoogleAccountDto | undefined, fallbackId: string): string {
  if (!account) return fallbackId.slice(0, 8);
  return account.label || account.displayName || account.email || fallbackId.slice(0, 8);
}

function findLaneJob(
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
      if (isQueuedState(j.state)) return false;
      return ![
        'COMPLETED',
        'ACCEPTED_WITH_WARNINGS',
        'CANCELLED',
        'FAILED',
        'SKIPPED',
      ].includes(j.state);
    }) ?? null
  );
}

function laneStatusKey(health: string): 'running' | 'ready' | 'limited' | 'attention' | 'paused' {
  const h = health.toUpperCase();
  if (h === 'BUSY') return 'running';
  if (h === 'READY') return 'ready';
  if (h === 'LIMITED') return 'limited';
  if (h === 'DISABLED' || h === 'OFFLINE') return 'paused';
  return 'attention';
}

export function JobsPage() {
  const t = useT();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [accounts, setAccounts] = useState<GoogleAccountDto[]>([]);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerSnap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<JobAttemptDto[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [projectResult, accountResult, jobResult, status, workerResult] = await Promise.all([
      window.novelTrans.projects.list(),
      window.novelTrans.accounts.list(),
      window.novelTrans.jobs.list(undefined),
      window.novelTrans.jobs.schedulerStatus(),
      window.novelTrans.jobs.workers(),
    ]);
    setProjects(projectResult.projects);
    setAccounts(accountResult.accounts);
    setJobs(jobResult.jobs);
    setScheduler({
      running: status.running,
      paused: status.paused,
      inFlight: status.inFlight,
      maxConcurrent: status.maxConcurrent,
      perProjectMax: status.perProjectMax,
      allowSameProjectParallel: status.allowSameProjectParallel,
    });
    setWorkers(workerResult.workers);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => {
        setLoading(false);
      });
    const id = window.setInterval(() => {
      void refresh().catch(() => {
        /* poll best-effort */
      });
    }, 4000);
    return () => {
      window.clearInterval(id);
    };
  }, [refresh, t]);

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const projectTitle = useCallback(
    (id: string) => projects.find((p) => p.id === id)?.title ?? id.slice(0, 8),
    [projects],
  );

  const runningCount = scheduler?.inFlight ?? 0;
  const readyAccounts = accounts.filter((a) => a.status === 'READY').length;
  const queuedCount = jobs.filter((j) => isQueuedState(j.state)).length;
  const attentionJobs = useMemo(
    () => jobs.filter((j) => isJobAttention(j.state)),
    [jobs],
  );

  const queuedByProject = useMemo(() => {
    const map = new Map<string, JobDto[]>();
    for (const job of jobs) {
      if (!isQueuedState(job.state)) continue;
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
      return projectTitle(a[0]).localeCompare(projectTitle(b[0]));
    });
  }, [jobs, projectTitle]);

  const sortedWorkers = useMemo(() => {
    return [...workers].sort((a, b) => {
      const rank = (h: string) => {
        const k = laneStatusKey(h);
        if (k === 'running') return 0;
        if (k === 'attention') return 1;
        if (k === 'limited') return 2;
        if (k === 'ready') return 3;
        return 4;
      };
      const d = rank(a.health) - rank(b.health);
      if (d !== 0) return d;
      return a.priority - b.priority;
    });
  }, [workers]);

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

  const runControl = async (fn: () => Promise<{ message?: string } | void>) => {
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
  };

  const setJobPriority = async (jobId: string, band: PriorityBand) => {
    await runControl(async () => {
      await window.novelTrans.jobs.move(jobId, PRIORITY[band]);
      return { message: t('jobs.priorityUpdated') };
    });
  };

  const setProjectQueuePriority = async (projectId: string, band: PriorityBand) => {
    const queued = jobs.filter((j) => j.projectId === projectId && isQueuedState(j.state));
    if (queued.length === 0) return;
    await runControl(async () => {
      for (const job of queued) {
        await window.novelTrans.jobs.move(job.id, PRIORITY[band]);
      }
      return { message: t('jobs.priorityUpdated') };
    });
  };

  const selected = selectedId ? jobById.get(selectedId) ?? null : null;
  const errInfo = error ? friendlyError(error) : null;
  const fairnessNote =
    scheduler && !scheduler.allowSameProjectParallel
      ? t('jobs.fairnessOnePerProject')
      : scheduler
        ? t('jobs.fairnessPerProjectMax', { n: String(scheduler.perProjectMax) })
        : null;

  if (loading) {
    return (
      <div>
        <PageHeader title={t('jobs.title')} description={t('jobs.subtitle')} />
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={88} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ops-center">
      <PageHeader
        title={t('jobs.title')}
        description={t('jobs.subtitle')}
        actions={<HelpContextButton articleId="jobs-monitor" />}
      />

      {errInfo ? (
        <ErrorPanel
          title={errInfo.title}
          description={errInfo.description}
          technical={errInfo.technical}
          helpArticleId={helpArticleForErrorCode(errInfo.code)}
        />
      ) : null}
      {message ? (
        <div className="banner banner-info" style={{ marginBottom: '0.75rem' }}>
          {message}
        </div>
      ) : null}

      <div className="ops-header-card">
        <div className="ops-stat-grid">
          <div className="ops-stat">
            <span className="ops-stat-label">{t('jobs.statRunning')}</span>
            <strong className="ops-stat-value">{runningCount}</strong>
            <span className="ops-stat-unit">{t('jobs.statStreams')}</span>
          </div>
          <div className="ops-stat">
            <span className="ops-stat-label">{t('jobs.statReady')}</span>
            <strong className="ops-stat-value">{readyAccounts}</strong>
            <span className="ops-stat-unit">{t('jobs.statAccounts')}</span>
          </div>
          <div className="ops-stat">
            <span className="ops-stat-label">{t('jobs.statQueued')}</span>
            <strong className="ops-stat-value">{queuedCount}</strong>
            <span className="ops-stat-unit">{t('jobs.statJobs')}</span>
          </div>
          <div className="ops-stat">
            <span className="ops-stat-label">{t('jobs.statAttention')}</span>
            <strong className="ops-stat-value">{attentionJobs.length}</strong>
          </div>
        </div>
        <div className="ops-header-actions">
          {scheduler?.paused ? (
            <Button
              disabled={busy}
              onClick={() =>
                void runControl(async () => {
                  const r = await window.novelTrans.jobs.resumeAll();
                  return { message: r.message };
                })
              }
            >
              {t('jobs.resumeAll')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runControl(async () => {
                  const r = await window.novelTrans.jobs.pauseAll();
                  return { message: r.message };
                })
              }
            >
              {t('jobs.pauseAll')}
            </Button>
          )}
        </div>
        {fairnessNote ? <p className="ops-fairness muted">{fairnessNote}</p> : null}
      </div>

      <SectionHeader title={t('jobs.workerLanes')} />
      {sortedWorkers.length === 0 ? (
        <EmptyState
          title={t('jobs.noWorkers')}
          description={t('jobs.noWorkersHint')}
          actionLabel={t('nav.accounts')}
          onAction={() => {
            navigate('/accounts');
          }}
        />
      ) : (
        <div className="ops-lane-list">
          {sortedWorkers.map((worker) => {
            const account = accountById.get(worker.accountId);
            const job = findLaneJob(worker, jobById, jobs);
            const lane = laneStatusKey(worker.health);
            const measure = job ? measureJobProgress(job) : null;
            const channel = friendlyChannel(job);
            const knowledge = knowledgeLabel(job);
            const chapters = chapterRange(job);

            return (
              <Card key={worker.id} className={`ops-lane ops-lane--${lane}`}>
                <div className="ops-lane-head">
                  <div>
                    <h3 className="ops-lane-title">
                      {accountDisplayName(account, worker.accountId)}
                    </h3>
                    <p className={`ops-lane-status ops-lane-status--${lane}`}>
                      <span className="ops-lane-dot" aria-hidden />
                      {t(`jobs.lane.${lane}`)}
                    </p>
                  </div>
                  <div className="ops-lane-actions">
                    {lane === 'paused' || account?.workerEnabled === false ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void runControl(async () => {
                            await window.novelTrans.accounts.enable(worker.accountId);
                            return { message: t('jobs.workerResumed') };
                          })
                        }
                      >
                        {t('actions.resume')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || lane === 'running'}
                        title={
                          lane === 'running' ? t('jobs.pauseWorkerBusyHint') : undefined
                        }
                        onClick={() =>
                          void runControl(async () => {
                            await window.novelTrans.accounts.disable(worker.accountId);
                            return { message: t('jobs.workerPaused') };
                          })
                        }
                      >
                        {t('jobs.pauseWorker')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void runControl(async () => {
                          await window.novelTrans.accounts.openBrowser(
                            worker.accountId,
                            'gemini',
                          );
                          return { message: t('jobs.openedGemini') };
                        })
                      }
                    >
                      {t('jobs.openGemini')}
                    </Button>
                  </div>
                </div>

                {job ? (
                  <div className="ops-lane-body">
                    <p className="ops-lane-project">{projectTitle(job.projectId)}</p>
                    {chapters ? (
                      <p className="muted ops-lane-meta">
                        {t('jobs.chapterLabel', { range: chapters })}
                      </p>
                    ) : null}
                    <p className="muted ops-lane-meta">
                      {[channel, knowledge].filter(Boolean).join(' · ')}
                    </p>
                    {typeof job.progress?.paragraphsDone === 'number' &&
                    typeof job.progress?.paragraphsTotal === 'number' &&
                    job.progress.paragraphsTotal > 0 ? (
                      <p className="ops-lane-paras">
                        {t('jobs.paragraphsProgress', {
                          done: String(job.progress.paragraphsDone),
                          total: String(job.progress.paragraphsTotal),
                        })}
                      </p>
                    ) : null}
                    {measure ? (
                      <ProgressBar
                        value={measure.percent}
                        indeterminate={measure.indeterminate}
                        label={
                          paragraphProgress(job) ?? statusLabel(job.state)
                        }
                      />
                    ) : null}
                    <div className="ops-lane-actions" style={{ marginTop: '0.5rem' }}>
                      {job.error || isJobAttention(job.state) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            void openJob(job.id);
                          }}
                        >
                          {t('jobs.viewError')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void openJob(job.id);
                          }}
                        >
                          {t('actions.viewDetails')}
                        </Button>
                      )}
                      {(job.state === 'FAILED' || job.state === 'NEEDS_ATTENTION' || job.state === 'CANCELLED') && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void runControl(async () => {
                              const r = await window.novelTrans.jobs.retry(job.id);
                              return { message: r.message };
                            })
                          }
                        >
                          {t('actions.retry')}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : worker.lastError && lane === 'attention' ? (
                  <div className="ops-lane-body">
                    <p className="error-text" style={{ margin: 0 }}>
                      {worker.lastError.slice(0, 160)}
                    </p>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {attentionJobs.length > 0 ? (
        <>
          <SectionHeader title={t('jobs.needsAttention')} />
          <div className="ops-lane-list">
            {attentionJobs.map((job) => (
              <Card key={job.id} className="ops-attention-card">
                <div className="page-header-row">
                  <div>
                    <strong>{projectTitle(job.projectId)}</strong>
                    <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                      {chapterRange(job)
                        ? t('jobs.chapterLabel', { range: chapterRange(job)! })
                        : null}
                      {' · '}
                      {statusLabel(job.state)}
                    </p>
                    {job.error ? (
                      <p className="error-text" style={{ margin: '0.35rem 0 0' }}>
                        {job.error.slice(0, 180)}
                      </p>
                    ) : null}
                  </div>
                  <div className="btn-row">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void openJob(job.id);
                      }}
                    >
                      {t('jobs.viewError')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void runControl(async () => {
                          const r = await window.novelTrans.jobs.retry(job.id);
                          return { message: r.message };
                        })
                      }
                    >
                      {t('actions.retry')}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      <SectionHeader title={t('jobs.nextQueued')} />
      {queuedByProject.length === 0 ? (
        <EmptyState title={t('jobs.queueEmpty')} />
      ) : (
        <div className="ops-queue-list">
          {queuedByProject.map(([projectId, projectJobs]) => {
            const next = projectJobs[0]!;
            const band = priorityBand(next.priority);
            return (
              <Card key={projectId} className="ops-queue-card">
                <div className="ops-queue-main">
                  <div>
                    <h3 className="ops-queue-title">{projectTitle(projectId)}</h3>
                    <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                      {t('jobs.queuedCount', { n: String(projectJobs.length) })}
                      {chapterRange(next)
                        ? ` · ${t('jobs.nextChapter', { range: chapterRange(next)! })}`
                        : ''}
                    </p>
                  </div>
                  <label className="ops-priority">
                    <span className="muted">{t('jobs.priority')}</span>
                    <Select
                      value={band}
                      disabled={busy}
                      aria-label={t('jobs.priority')}
                      onChange={(e) => {
                        void setProjectQueuePriority(
                          projectId,
                          e.target.value as PriorityBand,
                        );
                      }}
                    >
                      <option value="high">{t('jobs.priorityHigh')}</option>
                      <option value="normal">{t('jobs.priorityNormal')}</option>
                      <option value="low">{t('jobs.priorityLow')}</option>
                    </Select>
                  </label>
                </div>
                {!scheduler?.allowSameProjectParallel ? (
                  <p className="muted ops-queue-note">{t('jobs.oneStreamHint')}</p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Drawer
        open={drawerOpen && selected != null}
        title={selected ? projectTitle(selected.projectId) : t('jobs.detail')}
        onClose={() => {
          setDrawerOpen(false);
        }}
        closeLabel={t('actions.close')}
      >
        {selected ? (
          <div className="ops-detail">
            <p>
              <strong>{statusLabel(selected.state)}</strong>
              {(() => {
                const range = chapterRange(selected);
                return range ? ` · ${t('jobs.chapterLabel', { range })}` : '';
              })()}
            </p>
            {selected.error ? (
              <div className="banner banner-error" style={{ margin: '0.75rem 0' }}>
                {selected.error}
              </div>
            ) : null}
            <p className="muted">
              {[friendlyChannel(selected), knowledgeLabel(selected), paragraphProgress(selected)]
                .filter(Boolean)
                .join(' · ')}
            </p>

            <label className="ops-priority" style={{ display: 'block', marginTop: '0.75rem' }}>
              <span className="muted">{t('jobs.priority')}</span>
              <Select
                value={priorityBand(selected.priority)}
                disabled={busy}
                onChange={(e) => {
                  void setJobPriority(selected.id, e.target.value as PriorityBand);
                }}
              >
                <option value="high">{t('jobs.priorityHigh')}</option>
                <option value="normal">{t('jobs.priorityNormal')}</option>
                <option value="low">{t('jobs.priorityLow')}</option>
              </Select>
            </label>

            <div className="btn-row" style={{ marginTop: '0.75rem' }}>
              {(selected.state === 'FAILED' ||
                selected.state === 'NEEDS_ATTENTION' ||
                selected.state === 'CANCELLED') && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void runControl(async () => {
                      const r = await window.novelTrans.jobs.retry(selected.id);
                      return { message: r.message };
                    })
                  }
                >
                  {t('actions.retry')}
                </Button>
              )}
              {selected.pinnedAccountId || selected.progress?.accountId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    const aid = selected.progress?.accountId ?? selected.pinnedAccountId;
                    if (!aid) return;
                    void runControl(async () => {
                      await window.novelTrans.accounts.openBrowser(aid, 'gemini');
                      return { message: t('jobs.openedGemini') };
                    });
                  }}
                >
                  {t('jobs.openGemini')}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || selected.state === 'CANCELLED'}
                onClick={() =>
                  void runControl(async () => {
                    const r = await window.novelTrans.jobs.cancel(selected.id);
                    return { message: r.message };
                  })
                }
              >
                {t('actions.cancel')}
              </Button>
            </div>

            <button
              type="button"
              className="ops-advanced-toggle"
              onClick={() => {
                setShowAdvanced((v) => !v);
              }}
            >
              {showAdvanced ? t('jobs.hideAdvanced') : t('jobs.showAdvanced')}
            </button>
            {showAdvanced ? (
              <div className="ops-advanced muted">
                <p>ID: {selected.id}</p>
                <p>
                  {t('jobs.account')}:{' '}
                  {selected.progress?.accountId ?? selected.pinnedAccountId ?? '—'}
                </p>
                <p>
                  {t('jobs.status')}: {selected.state} · attempts {selected.attemptCount}
                </p>
                {selected.progress?.packMode ? (
                  <p>packMode: {selected.progress.packMode}</p>
                ) : null}
                {selected.progress?.providerType ? (
                  <p>provider: {selected.progress.providerType}</p>
                ) : null}
                {attempts.length > 0 ? (
                  <ul style={{ paddingLeft: '1.1rem' }}>
                    {attempts.slice(0, 8).map((a) => (
                      <li key={a.id}>
                        #{a.attemptNumber} {a.state}
                        {a.error ? ` — ${a.error.slice(0, 80)}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
