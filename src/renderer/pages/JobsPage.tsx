import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import type { JobAttemptDto, JobDto } from '@shared/schemas/job';
import type { AttentionAction } from '@shared/constants/job';
import type { ProjectDto } from '@shared/schemas/import';
import { formatMemoryUsage, formatTranslateChannel } from '@shared/utils/translate-channel';
import {
  formatDiagnosticsAiChannel,
  formatDiagnosticsContextMode,
  formatDiagnosticsGroundingWarning,
  formatDiagnosticsKnowledgeVersions,
  formatDiagnosticsMemorySurface,
  readDiagnosticsFromProgress,
} from '@shared/constants/translation-context';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import {
  formatJobAttemptDetail,
  formatJobAttemptHeadline,
} from '../utils/job-attempt-summary';
import { statusLabel } from '../i18n/status';
import { workerModeLabel } from '../i18n/enums';
import { helpArticleForErrorCode } from '../features/help/content';
import {
  PageHeader,
  Button,
  Card,
  EmptyState,
  StatusBadge,
  Dialog,
  Drawer,
  DataTable,
  ProgressBar,
  ErrorPanel,
  Select,
  Skeleton,
  Input,
  SectionHeader,
  ChapterStatus,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';

interface SchedulerStatus {
  running: boolean;
  paused: boolean;
  inFlight: number;
  maxConcurrent: number;
}

interface WorkerRow {
  id: string;
  accountId: string;
  health: string;
  priority: number;
  currentJobId: string | null;
  limitedUntil: string | null;
  lastError: string | null;
}

const WORKFLOW_KEYS = [
  'jobs.workflow.prepare',
  'jobs.workflow.matchTerms',
  'jobs.workflow.openGemini',
  'jobs.workflow.translating',
  'jobs.workflow.check',
  'jobs.workflow.updateMemory',
  'jobs.workflow.done',
] as const;

function workflowStepIndex(state: string): number {
  switch (state) {
    case 'QUEUED':
    case 'PREPARING':
      return 0;
    case 'WAITING_WORKER':
      return 1;
    case 'SENDING':
      return 2;
    case 'WAITING_AI':
    case 'RUNNING':
    case 'PAUSED':
      return 3;
    case 'PARSING':
    case 'QA':
    case 'REPAIRING':
    case 'NEEDS_ATTENTION':
      return 4;
    case 'COMPLETED':
    case 'ACCEPTED_WITH_WARNINGS':
      return 6;
    case 'FAILED':
    case 'CANCELLED':
    case 'SKIPPED':
      return 4;
    default:
      return 0;
  }
}

function jobProgress(job: JobDto): number {
  if (job.state === 'COMPLETED' || job.state === 'ACCEPTED_WITH_WARNINGS') return 100;
  if (job.state === 'FAILED' || job.state === 'CANCELLED' || job.state === 'SKIPPED') {
    return Math.min(95, Math.max(5, workflowStepIndex(job.state) * 14));
  }
  const total = job.progress?.paragraphsTotal;
  const done = job.progress?.paragraphsDone;
  if (typeof total === 'number' && total > 0 && typeof done === 'number') {
    return Math.min(95, Math.max(5, Math.round((done / total) * 100)));
  }
  return Math.min(95, Math.max(5, Math.round((workflowStepIndex(job.state) / 6) * 100)));
}

function jobProgressLabel(job: JobDto, fallback: string, t: (key: string) => string): string {
  if (job.progress?.phase === 'continuation') {
    const round = job.progress.continuationRound;
    const suffix = typeof round === 'number' ? ` (${round})` : '';
    return t('jobs.continuationReceiving') + suffix;
  }
  const total = job.progress?.paragraphsTotal;
  const done = job.progress?.paragraphsDone;
  const chunkIndex = job.progress?.chunkIndex;
  const chunkTotal = job.progress?.chunkTotal;
  const parts: string[] = [];
  if (typeof chunkTotal === 'number' && chunkTotal > 1 && typeof chunkIndex === 'number') {
    parts.push(`Lô ${chunkIndex}/${chunkTotal}`);
  }
  if (typeof total === 'number' && total > 0 && typeof done === 'number') {
    parts.push(`${done}/${total}`);
  }
  const channel = formatTranslateChannel({
    providerType: job.progress?.providerType,
    packMode: job.progress?.packMode,
  });
  if (channel) parts.push(channel);
  if (parts.length > 0) return `${parts.join(' · ')} · ${fallback}`;
  return fallback;
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '—';
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return '—';
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  if (Number.isNaN(end)) return '—';
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function JobsPage() {
  const t = useT();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState('');
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [attempts, setAttempts] = useState<JobAttemptDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [priorityDraft, setPriorityDraft] = useState('100');
  const [workerModeDraft, setWorkerModeDraft] = useState<'POOL' | 'PINNED'>('POOL');
  const [pinnedAccountDraft, setPinnedAccountDraft] = useState('');
  const [cancelTarget, setCancelTarget] = useState<JobDto | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<'cancel' | 'delete' | 'retry' | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const projectResult = await window.novelTrans.projects.list();
    setProjects(projectResult.projects);
    const pid = projectId || projectResult.projects[0]?.id || '';
    if (!projectId && pid) setProjectId(pid);
    const [jobResult, status, workerResult] = await Promise.all([
      window.novelTrans.jobs.list(pid || undefined),
      window.novelTrans.jobs.schedulerStatus(),
      window.novelTrans.jobs.workers(),
    ]);
    setJobs(jobResult.jobs);
    setScheduler(status);
    setWorkers(workerResult.workers);
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(jobResult.jobs.map((j) => j.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [projectId]);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => { setLoading(false); });
  }, [refresh, t]);

  const selectJob = useCallback(async (jobId: string) => {
    setSelectedId(jobId);
    setDrawerOpen(true);
    setError(null);
    try {
      const detail = await window.novelTrans.jobs.get(jobId);
      setAttempts(detail.attempts);
      setPriorityDraft(String(detail.job.priority));
      setWorkerModeDraft(detail.job.workerMode);
      setPinnedAccountDraft(detail.job.pinnedAccountId ?? '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    }
  }, [t]);

  const runControl = async (fn: () => Promise<{ message: string }>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      setMessage(result.message);
      await refresh();
      if (selectedId) await selectJob(selectedId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: AttentionAction) => {
    if (!selectedId) return;
    await runControl(() => window.novelTrans.jobs.attention({ jobId: selectedId, action }));
  };

  const recover = async () => {
    if (!selectedId) return;
    await runControl(async () => {
      const result = await window.novelTrans.jobs.recover(selectedId);
      return { message: `${t('actions.retry')} · ${result.crashed}` };
    });
  };

  const toggleSelect = useCallback((jobId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(jobs.map((j) => j.id)));
  }, [jobs]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const runBulk = async (action: 'cancel' | 'delete' | 'retry') => {
    const jobIds = [...selectedIds];
    if (jobIds.length === 0) return;
    setBulkConfirm(null);
    await runControl(async () => {
      const result = await window.novelTrans.jobs.bulk({ jobIds, action });
      if (action === 'delete') setSelectedIds(new Set());
      return { message: result.message };
    });
  };

  const projectTitle = useCallback(
    (id: string) => projects.find((p) => p.id === id)?.title ?? id.slice(0, 8),
    [projects],
  );

  const selected = jobs.find((j) => j.id === selectedId) ?? null;
  const selectedCount = selectedIds.size;
  const allSelected = jobs.length > 0 && selectedCount === jobs.length;
  const emptyDeltaJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          (j.state === 'COMPLETED' || j.state === 'ACCEPTED_WITH_WARNINGS') &&
          j.progress?.learning?.emptyDeltas === true,
      ),
    [jobs],
  );
  const errInfo = error ? friendlyError(error) : null;
  const stepIndex = selected ? workflowStepIndex(selected.state) : -1;

  const bulkConfirmCopy =
    bulkConfirm === 'cancel'
      ? t('jobs.bulkCancelConfirm', { n: selectedCount })
      : bulkConfirm === 'delete'
        ? t('jobs.bulkDeleteConfirm', { n: selectedCount })
        : bulkConfirm === 'retry'
          ? t('jobs.bulkRetryConfirm', { n: selectedCount })
          : undefined;

  const columns = useMemo(
    () => [
      {
        key: 'select',
        header: (
          <input
            type="checkbox"
            aria-label={t('jobs.selectAll')}
            checked={allSelected}
            disabled={jobs.length === 0 || busy}
            onChange={() => {
              if (allSelected) clearSelection();
              else selectAllVisible();
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        ),
        width: '2.5rem',
        render: (job: JobDto) => (
          <input
            type="checkbox"
            checked={selectedIds.has(job.id)}
            disabled={busy}
            onChange={() => {
              toggleSelect(job.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        ),
      },
      {
        key: 'project',
        header: t('jobs.project'),
        render: (job: JobDto) => projectTitle(job.projectId),
      },
      {
        key: 'chapters',
        header: t('jobs.chapters'),
        render: (job: JobDto) =>
          job.chapterFrom != null
            ? t('topbar.chapters', {
                from: job.chapterFrom,
                to: job.chapterTo ?? job.chapterFrom,
              })
            : '—',
      },
      {
        key: 'status',
        header: t('jobs.status'),
        render: (job: JobDto) => <StatusBadge status={job.state} />,
      },
      {
        key: 'progress',
        header: t('jobs.progress'),
        render: (job: JobDto) => (
          <div style={{ minWidth: 100 }}>
            <ProgressBar
              value={jobProgress(job)}
              label={jobProgressLabel(job, statusLabel(job.state), t)}
            />
            {job.progress?.learning?.emptyDeltas ? (
              <div className="muted" style={{ fontSize: '0.8em', marginTop: 2 }}>
                {t('jobs.emptyDeltasShort')}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'actions',
        header: t('jobs.actions'),
        render: (job: JobDto) => (
          <div className="btn-row" onClick={(e) => { e.stopPropagation(); }}>
            <Button size="sm" disabled={busy} onClick={() => void selectJob(job.id)}>
              {t('actions.viewDetails')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => { setCancelTarget(job); }}
            >
              {t('actions.cancel')}
            </Button>
          </div>
        ),
      },
    ],
    [
      t,
      projectTitle,
      busy,
      selectJob,
      selectedIds,
      allSelected,
      jobs.length,
      clearSelection,
      selectAllVisible,
      toggleSelect,
    ],
  );

  if (loading) {
    return (
      <div>
        <PageHeader title={t('jobs.title')} description={t('jobs.subtitle')} />
        <Skeleton height={48} />
        <div style={{ marginTop: '1rem' }}>
          <Skeleton height={240} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('jobs.title')}
        description={t('jobs.subtitle')}
        actions={
          <>
            <HelpContextButton articleId="jobs-monitor" />
            <Button disabled={busy} onClick={() => void refresh()}>
              {t('actions.check')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void runControl(() => window.novelTrans.jobs.pauseAll())}
            >
              {t('actions.pause')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void runControl(() => window.novelTrans.jobs.resumeAll())}
            >
              {t('actions.resume')}
            </Button>
          </>
        }
      />

      {errInfo ? (
        <ErrorPanel
          title={errInfo.title}
          description={errInfo.description}
          technical={errInfo.technical}
          helpArticleId={helpArticleForErrorCode(errInfo.code)}
          actions={[{ label: t('actions.retry'), onClick: () => void refresh(), primary: true }]}
        />
      ) : null}
      {message ? <div className="banner banner-info">{message}</div> : null}
      {emptyDeltaJobs.length > 0 ? (
        <div className="banner banner-warn" style={{ marginBottom: '1rem' }}>
          {t('jobs.emptyDeltasBanner', { n: emptyDeltaJobs.length })}
        </div>
      ) : null}

      <div className="btn-row" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label className="inline-field">
          {t('jobs.project')}
          <Select
            value={projectId}
            disabled={busy}
            onChange={(event) => {
              setProjectId(event.target.value);
              setSelectedId(null);
              setSelectedIds(new Set());
              setAttempts([]);
              setDrawerOpen(false);
            }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>
        </label>
        {scheduler ? (
          <span className="muted">
            {scheduler.running ? t('status.running') : t('status.paused')}
            {scheduler.paused ? ` · ${t('actions.pause')}` : ''} · {scheduler.inFlight}/
            {scheduler.maxConcurrent}
          </span>
        ) : null}
      </div>

      {workers.length > 0 ? (
        <div style={{ marginBottom: '1rem' }}>
          <Card className="account-card">
            <SectionHeader title={t('jobs.account')} />
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {workers.map((w) => (
                <li key={w.id} className="muted" style={{ marginBottom: '0.35rem' }}>
                  <StatusBadge status={w.health} />{' '}
                  {w.accountId.slice(0, 8)}…
                  {w.currentJobId ? ` · ${w.currentJobId.slice(0, 8)}…` : ''}
                  {w.limitedUntil ? ` · ${t('status.limited')} ${w.limitedUntil}` : ''}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t('jobs.emptyTitle')}
          description={t('jobs.emptyDesc')}
        />
      ) : (
        <>
          <div className="btn-row" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <span className="muted">
              {t('jobs.selectedCount', { n: selectedCount })}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || allSelected}
              onClick={selectAllVisible}
            >
              {t('jobs.selectAll')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || selectedCount === 0}
              onClick={clearSelection}
            >
              {t('jobs.clearSelection')}
            </Button>
            <Button
              size="sm"
              disabled={busy || selectedCount === 0}
              onClick={() => { setBulkConfirm('cancel'); }}
            >
              {t('jobs.bulkCancel')}
            </Button>
            <Button
              size="sm"
              disabled={busy || selectedCount === 0}
              onClick={() => { setBulkConfirm('retry'); }}
            >
              {t('jobs.bulkRetry')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy || selectedCount === 0}
              onClick={() => { setBulkConfirm('delete'); }}
            >
              {t('jobs.bulkDelete')}
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={jobs}
            rowKey={(row) => row.id}
            selectedKey={selectedId}
            onRowClick={(row) => {
              void selectJob(row.id);
            }}
          />
        </>
      )}

      <Drawer
        open={drawerOpen && selected !== null}
        title={t('jobs.detail')}
        closeLabel={t('actions.close')}
        onClose={() => { setDrawerOpen(false); }}
      >
        {selected ? (
          <>
            <p style={{ marginTop: 0 }}>
              <StatusBadge status={selected.state} />
              {selected.error ? (
                <span className="muted"> — {friendlyError(selected.error).title}</span>
              ) : null}
            </p>
            {selected.error ? (
              <p
                className="banner banner-error"
                style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', fontSize: '0.9em' }}
              >
                {selected.error}
              </p>
            ) : null}
            <p className="muted">
              {projectTitle(selected.projectId)}
              {selected.chapterFrom != null
                ? ` · ${t('topbar.chapters', {
                    from: selected.chapterFrom,
                    to: selected.chapterTo ?? selected.chapterFrom,
                  })}`
                : ''}
            </p>
            <p className="muted">
              {t('jobs.started')}: {selected.startedAt ?? '—'} · {t('jobs.duration')}:{' '}
              {formatDuration(selected.startedAt, selected.completedAt)}
            </p>
            <p className="muted">
              {t('jobs.progress')} · {selected.attemptCount} · {selected.repairRound}/
              {selected.maxRepairAttempts} · {workerModeLabel(selected.workerMode)}
              {selected.pinnedAccountId
                ? ` · ${selected.pinnedAccountId.slice(0, 8)}…`
                : ''}
            </p>
            {(() => {
              const diag = readDiagnosticsFromProgress(
                selected.progress as Record<string, unknown> | null | undefined,
              );
              if (!diag) {
                return formatTranslateChannel({
                  providerType: selected.progress?.providerType,
                  packMode: selected.progress?.packMode,
                }) ? (
                  <p className="muted">
                    {t('jobs.channel')}:{' '}
                    {formatTranslateChannel({
                      providerType: selected.progress?.providerType,
                      packMode: selected.progress?.packMode,
                    })}
                  </p>
                ) : null;
              }
              const ai = formatDiagnosticsAiChannel(diag.providerType);
              const memory = formatDiagnosticsMemorySurface(diag);
              const knowledge = formatDiagnosticsKnowledgeVersions(diag);
              const mode = formatDiagnosticsContextMode(diag);
              const warning = formatDiagnosticsGroundingWarning(diag);
              return (
                <div className="job-context-diagnostics" style={{ marginTop: '0.5rem' }}>
                  {ai ? (
                    <p className="muted" style={{ margin: '0.15rem 0' }}>
                      {t('jobs.diagAiChannel')}: <strong>{ai}</strong>
                    </p>
                  ) : null}
                  <p className="muted" style={{ margin: '0.15rem 0' }}>
                    {t('jobs.diagMemory')}: <strong>{memory}</strong>
                  </p>
                  {diag.notebookName ? (
                    <p className="muted" style={{ margin: '0.15rem 0' }}>
                      {t('jobs.diagNotebook')}: <strong>{diag.notebookName}</strong>
                    </p>
                  ) : null}
                  {knowledge ? (
                    <p className="muted" style={{ margin: '0.15rem 0' }}>
                      {t('jobs.diagKnowledge')}: <strong>{knowledge}</strong>
                    </p>
                  ) : null}
                  <p className="muted" style={{ margin: '0.15rem 0' }}>
                    {t('jobs.diagContextMode')}: <strong>{mode}</strong>
                  </p>
                  {diag.knowledgeSourceMode ? (
                    <p className="muted" style={{ margin: '0.15rem 0' }}>
                      {t('jobs.diagSourceMode')}: {diag.knowledgeSourceMode}
                      {typeof diag.hotDeltaCount === 'number' && diag.hotDeltaCount > 0
                        ? ` · delta ${diag.hotDeltaCount}`
                        : ''}
                    </p>
                  ) : null}
                  {warning ? (
                    <p
                      className="banner"
                      style={{
                        marginTop: '0.4rem',
                        fontSize: '0.9em',
                        background: 'var(--warning-bg, #fff3cd)',
                        padding: '0.4rem 0.6rem',
                      }}
                    >
                      {warning}
                    </p>
                  ) : null}
                  {selected.progress?.timeline && selected.progress.timeline.length > 0 ? (
                    <div style={{ marginTop: '0.6rem' }}>
                      <p className="muted" style={{ marginBottom: '0.25rem' }}>
                        {t('jobs.diagTimeline')}
                      </p>
                      <ul
                        style={{
                          listStyle: 'none',
                          padding: 0,
                          margin: 0,
                          fontSize: '0.85em',
                          maxHeight: '10rem',
                          overflow: 'auto',
                        }}
                      >
                        {selected.progress.timeline.map((entry, i) => (
                          <li
                            key={`${entry.at}-${entry.event}-${i}`}
                            className="muted"
                            style={{ marginBottom: '0.2rem' }}
                          >
                            <code>{entry.event}</code>
                            {entry.message ? ` — ${entry.message}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })()}
            {selected.progress?.packMode &&
            !readDiagnosticsFromProgress(
              selected.progress as Record<string, unknown> | null | undefined,
            ) ? (
              <p className="muted">
                {formatMemoryUsage(selected.progress.packMode)}
                {typeof selected.progress.hotDeltaCount === 'number'
                  ? ` · delta ${selected.progress.hotDeltaCount}`
                  : ''}
                {typeof selected.progress.localKnowledgeVersion === 'number' &&
                typeof selected.progress.notebookVerifiedVersion === 'number'
                  ? ` · v${selected.progress.localKnowledgeVersion}/v${selected.progress.notebookVerifiedVersion}`
                  : ''}
              </p>
            ) : null}
            {selected.progress?.learning ? (
              <p className="muted">
                {t('jobs.learning')}: candidates{' '}
                {selected.progress.learning.candidatesCreated ?? 0} · memory{' '}
                {selected.progress.learning.memoryApplied ?? 0}
                {selected.progress.learning.emptyDeltas ? ' · empty deltas' : ''}
              </p>
            ) : null}
            <ProgressBar
              value={jobProgress(selected)}
              label={jobProgressLabel(selected, statusLabel(selected.state), t)}
            />

            <SectionHeader title={t('jobs.detail')} />
            <ul className="workflow-checklist" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {WORKFLOW_KEYS.map((key, index) => {
                const done = index < stepIndex || (selected.state === 'COMPLETED' && index <= 6);
                const current = index === stepIndex && selected.state !== 'COMPLETED';
                return (
                  <li
                    key={key}
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'center',
                      marginBottom: '0.4rem',
                      fontWeight: current ? 600 : undefined,
                      color: current ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    <ChapterStatus done={done || (selected.state === 'COMPLETED' && index === 6)} />
                    <span>{t(key)}</span>
                  </li>
                );
              })}
            </ul>

            {selected.lastQa ? (
              <p>
                {t('translation.qa')}: <strong>{selected.lastQa.verdict}</strong>
                {selected.lastQa.missingParagraphIds.length > 0
                  ? ` · ${selected.lastQa.missingParagraphIds.length}`
                  : ''}
              </p>
            ) : null}

            <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              <label className="inline-field">
                {t('jobs.progress')}
                <Input
                  type="number"
                  value={priorityDraft}
                  disabled={busy}
                  style={{ width: '5rem' }}
                  onChange={(e) => { setPriorityDraft(e.target.value); }}
                />
              </label>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void runControl(() =>
                    window.novelTrans.jobs.move(
                      selected.id,
                      Number.parseInt(priorityDraft, 10) || 100,
                    ),
                  )
                }
              >
                {t('actions.manage')}
              </Button>
              <label className="inline-field">
                {t('jobs.account')}
                <Select
                  value={workerModeDraft}
                  disabled={busy}
                  onChange={(e) => { setWorkerModeDraft(e.target.value as 'POOL' | 'PINNED'); }}
                >
                  <option value="POOL">{workerModeLabel('POOL')}</option>
                  <option value="PINNED">{workerModeLabel('PINNED')}</option>
                </Select>
              </label>
              {workerModeDraft === 'PINNED' ? (
                <Select
                  value={pinnedAccountDraft}
                  disabled={busy}
                  onChange={(e) => { setPinnedAccountDraft(e.target.value); }}
                >
                  <option value="">{t('actions.switchAccount')}</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.accountId}>
                      {w.accountId.slice(0, 8)}… ({statusLabel(w.health)})
                    </option>
                  ))}
                </Select>
              ) : null}
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void runControl(() =>
                    window.novelTrans.jobs.changeWorker({
                      jobId: selected.id,
                      workerMode: workerModeDraft,
                      pinnedAccountId:
                        workerModeDraft === 'PINNED' ? pinnedAccountDraft || null : null,
                    }),
                  )
                }
              >
                {t('actions.switchAccount')}
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => { setCancelTarget(selected); }}>
                {t('actions.cancel')}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void runControl(() => window.novelTrans.jobs.retry(selected.id))}
              >
                {t('actions.retry')}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void recover()}>
                {t('actions.handle')}
              </Button>
            </div>

            {selected.state === 'NEEDS_ATTENTION' ? (
              <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => void runControl(() => window.novelTrans.jobs.retry(selected.id))}
                >
                  {t('actions.retry')}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void runAction('skip')}>
                  {t('actions.cancel')}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void runAction('manual_fix')}>
                  {t('actions.handle')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void runAction('accept_with_warning')}
                >
                  {t('actions.confirm')}
                </Button>
              </div>
            ) : null}

            <SectionHeader title={t('logs.activity')} />
            {attempts.length === 0 ? (
              selected.error ? (
                <div>
                  <p style={{ margin: '0 0 0.35rem', fontWeight: 600 }}>
                    {friendlyError(selected.error).title}
                  </p>
                  <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {selected.error}
                  </p>
                  <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9em' }}>
                    {friendlyError(selected.error).description}
                  </p>
                </div>
              ) : (
                <p className="muted">{t('common.noData')}</p>
              )
            ) : (
              <ol style={{ paddingLeft: '1.1rem', margin: 0 }}>
                {attempts.map((attempt) => {
                  const detail = formatJobAttemptDetail(attempt);
                  return (
                    <li key={attempt.id} style={{ marginBottom: '0.65rem' }}>
                      <strong>{formatJobAttemptHeadline(attempt)}</strong>
                      {attempt.inputRef ? (
                        <div className="muted" style={{ fontSize: '0.85em' }}>
                          {t('logs.attemptInput', { ref: attempt.inputRef })}
                        </div>
                      ) : null}
                      {detail ? (
                        <div style={{ fontSize: '0.9em', marginTop: '0.15rem' }}>{detail}</div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        ) : null}
      </Drawer>

      <Dialog
        open={cancelTarget !== null}
        title={t('actions.cancel')}
        description={
          cancelTarget
            ? `${projectTitle(cancelTarget.projectId)} · ${statusLabel(cancelTarget.state)}`
            : undefined
        }
        confirmLabel={t('actions.cancel')}
        cancelLabel={t('actions.close')}
        danger
        busy={busy}
        onConfirm={() => {
          if (!cancelTarget) return;
          const id = cancelTarget.id;
          setCancelTarget(null);
          void runControl(() => window.novelTrans.jobs.cancel(id));
        }}
        onCancel={() => { setCancelTarget(null); }}
      />

      <Dialog
        open={bulkConfirm !== null}
        title={
          bulkConfirm === 'delete'
            ? t('jobs.bulkDelete')
            : bulkConfirm === 'retry'
              ? t('jobs.bulkRetry')
              : t('jobs.bulkCancel')
        }
        description={bulkConfirmCopy}
        confirmLabel={
          bulkConfirm === 'delete'
            ? t('jobs.bulkDelete')
            : bulkConfirm === 'retry'
              ? t('jobs.bulkRetry')
              : t('jobs.bulkCancel')
        }
        cancelLabel={t('actions.close')}
        danger={bulkConfirm === 'cancel' || bulkConfirm === 'delete'}
        busy={busy}
        onConfirm={() => {
          if (!bulkConfirm) return;
          void runBulk(bulkConfirm);
        }}
        onCancel={() => { setBulkConfirm(null); }}
      />
    </div>
  );
}
