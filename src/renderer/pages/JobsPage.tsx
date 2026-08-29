import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader,
  Button,
  Dialog,
  ErrorPanel,
  SectionHeader,
  Skeleton,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { friendlyError } from '../i18n/errors';
import { helpArticleForErrorCode } from '../features/help/content';
import { useT } from '../i18n';
import { ActionRequiredJobs } from '../features/jobs/ActionRequiredJobs';
import { AiAccountSection } from '../features/jobs/AiAccountSection';
import { JobDetailDrawer } from '../features/jobs/JobDetailDrawer';
import { JobsBulkBar } from '../features/jobs/JobsBulkBar';
import { JobsOverflowMenu } from '../features/jobs/JobsOverflowMenu';
import { JobsSummaryStrip } from '../features/jobs/JobsSummaryStrip';
import { ProjectQueueSection } from '../features/jobs/ProjectQueueSection';
import { RecentJobsSection } from '../features/jobs/RecentJobsSection';
import { RunningJobCard } from '../features/jobs/RunningJobCard';
import { collectManageableJobIds } from '../features/jobs/jobs-utils';
import { useJobsControls } from '../features/jobs/useJobsControls';
import { useJobsOverview } from '../features/jobs/useJobsOverview';

export function JobsPage() {
  const t = useT();
  const navigate = useNavigate();
  const overview = useJobsOverview();
  const controls = useJobsControls(overview.refresh);

  const accountOrder = useMemo(
    () => new Map(overview.accounts.map((a, i) => [a.id, i])),
    [overview.accounts],
  );

  const selected = controls.selectedId
    ? overview.jobById.get(controls.selectedId) ?? null
    : null;

  const manageableJobIds = useMemo(
    () => collectManageableJobIds(overview.jobs),
    [overview.jobs],
  );

  const bulkConfirmDescription =
    controls.pendingBulkAction === 'cancel'
      ? t('jobs.bulkCancelConfirm', { n: String(controls.selectedJobIds.size) })
      : controls.pendingBulkAction === 'delete'
        ? t('jobs.bulkDeleteConfirm', { n: String(controls.selectedJobIds.size) })
        : controls.pendingBulkAction === 'retry'
          ? t('jobs.bulkRetryConfirm', { n: String(controls.selectedJobIds.size) })
          : '';

  const errInfo = controls.error ? friendlyError(controls.error) : null;
  const pageIdle =
    overview.runningCount === 0 &&
    overview.waitingCount === 0 &&
    overview.attentionJobs.length === 0 &&
    overview.pausedCount === 0;

  if (overview.loading) {
    return (
      <div className="jobs-page">
        <PageHeader title={t('jobs.title')} description={t('jobs.subtitle')} />
        <Skeleton height={72} />
        <div className="jobs-card-list">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="jobs-page">
      <PageHeader
        title={t('jobs.title')}
        description={t('jobs.subtitle')}
        actions={
          <div className="jobs-header-actions btn-row">
            {overview.scheduler?.paused ? (
              <Button
                disabled={controls.busy}
                onClick={() => {
                  void controls.resumeAll();
                }}
              >
                {t('jobs.resumeAll')}
              </Button>
            ) : overview.runningCount > 0 ? (
              <Button
                variant="secondary"
                disabled={controls.busy}
                onClick={() => {
                  void controls.pauseAll();
                }}
              >
                {t('jobs.pauseAll')}
              </Button>
            ) : null}
            <HelpContextButton articleId="jobs-monitor" />
            <JobsOverflowMenu
              scheduler={overview.scheduler}
              onMessage={(msg) => {
                controls.setMessage(msg);
              }}
            />
          </div>
        }
      />

      {overview.refreshError ? (
        <div className="banner banner-warning" style={{ marginBottom: '0.75rem' }}>
          {overview.refreshError}
        </div>
      ) : null}

      {errInfo ? (
        <ErrorPanel
          title={errInfo.title}
          description={errInfo.description}
          technical={errInfo.technical}
          helpArticleId={helpArticleForErrorCode(errInfo.code)}
        />
      ) : null}

      {controls.message ? (
        <div className="banner banner-info" style={{ marginBottom: '0.75rem' }}>
          {controls.message}
        </div>
      ) : null}

      <JobsSummaryStrip
        runningCount={overview.runningCount}
        waitingCount={overview.waitingCount}
        attentionCount={overview.attentionJobs.length}
        usableWorkers={overview.usableWorkers}
        pausedCount={overview.pausedCount}
        inFlight={overview.scheduler?.inFlight}
        maxConcurrent={overview.scheduler?.maxConcurrent}
        schedulerPaused={overview.scheduler?.paused}
      />

      <JobsBulkBar
        jobs={overview.jobs}
        selectedJobIds={controls.selectedJobIds}
        busy={controls.busy}
        onSelectAll={() => {
          controls.selectAllJobs(manageableJobIds);
        }}
        onClearSelection={controls.clearJobSelection}
        onBulkAction={controls.requestBulkAction}
      />

      {pageIdle ? (
        <div className="jobs-idle-cta">
          <p className="muted">{t('jobs.idleNoWaiting')}</p>
          <Button
            onClick={() => {
              navigate('/translation');
            }}
          >
            {t('jobs.translateNovel')}
          </Button>
        </div>
      ) : null}

      <ActionRequiredJobs
        jobs={overview.attentionJobs}
        titleFor={overview.titleFor}
        busy={controls.busy}
        selectedJobIds={controls.selectedJobIds}
        onToggleSelect={controls.toggleJobSelection}
        onOpen={(jobId) => {
          void controls.openJob(jobId);
        }}
        onRetry={(jobId) => {
          void controls.retryJob(jobId);
        }}
      />

      {overview.runningJobs.length > 0 ? (
        <section aria-labelledby="jobs-running-heading">
          <SectionHeader id="jobs-running-heading" title={t('jobs.runningTitle')} />
          <div className="jobs-card-list">
            {overview.runningJobs.map((job) => (
              <RunningJobCard
                key={job.id}
                job={job}
                titleFor={overview.titleFor}
                accountById={overview.accountById}
                accountOrder={accountOrder}
                busy={controls.busy}
                selected={controls.selectedJobIds.has(job.id)}
                onToggleSelect={controls.toggleJobSelection}
                onOpen={(jobId) => {
                  void controls.openJob(jobId);
                }}
                onPauseAll={() => {
                  void controls.pauseAll();
                }}
                onCancel={controls.requestCancel}
                onOpenGemini={(accountId) => {
                  void controls.runControl(async () => {
                    await window.novelTrans.accounts.openBrowser(accountId, 'gemini');
                    return { message: t('jobs.openedGemini') };
                  });
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      <ProjectQueueSection
        queuedByProject={overview.queuedByProject}
        titleFor={overview.titleFor}
        busy={controls.busy}
        selectedJobIds={controls.selectedJobIds}
        onToggleSelect={controls.toggleJobSelection}
        onSetPriority={(jobIds, band) => {
          void controls.setProjectQueuePriority(jobIds, band);
        }}
      />

      {overview.waitingCount === 0 &&
      overview.pausedCount === 0 &&
      overview.queuedByProject.length === 0 &&
      !pageIdle ? (
        <p className="muted jobs-queue-empty">{t('jobs.queueEmptySubtle')}</p>
      ) : null}

      <AiAccountSection
        workers={overview.workers}
        accounts={overview.accounts}
        jobById={overview.jobById}
        jobs={overview.jobs}
        titleFor={overview.titleFor}
        busy={controls.busy}
        onRunControl={(fn) => {
          void controls.runControl(fn);
        }}
      />

      <RecentJobsSection
        jobs={overview.recentJobs}
        titleFor={overview.titleFor}
        busy={controls.busy}
        selectedJobIds={controls.selectedJobIds}
        onToggleSelect={controls.toggleJobSelection}
      />

      <JobDetailDrawer
        open={controls.drawerOpen && selected != null}
        job={selected}
        attempts={controls.attempts}
        titleFor={overview.titleFor}
        accountById={overview.accountById}
        accountOrder={accountOrder}
        showAdvanced={controls.showAdvanced}
        busy={controls.busy}
        onClose={controls.closeDrawer}
        onToggleAdvanced={() => {
          controls.setShowAdvanced(!controls.showAdvanced);
        }}
        onSetPriority={(jobId, band) => {
          void controls.setJobPriority(jobId, band);
        }}
        onRetry={(jobId) => {
          void controls.retryJob(jobId);
        }}
        onCancel={controls.requestCancel}
        onOpenGemini={(accountId) => {
          void controls.runControl(async () => {
            await window.novelTrans.accounts.openBrowser(accountId, 'gemini');
            return { message: t('jobs.openedGemini') };
          });
        }}
      />

      <Dialog
        open={controls.pendingBulkAction != null}
        title={
          controls.pendingBulkAction === 'cancel'
            ? t('jobs.bulkCancel')
            : controls.pendingBulkAction === 'delete'
              ? t('jobs.bulkDelete')
              : t('jobs.bulkRetry')
        }
        description={bulkConfirmDescription}
        confirmLabel={t('actions.confirm')}
        cancelLabel={t('actions.close')}
        danger={controls.pendingBulkAction === 'delete'}
        busy={controls.busy}
        onConfirm={() => {
          void controls.confirmBulkAction();
        }}
        onCancel={controls.cancelBulkAction}
      />

      <Dialog
        open={controls.cancelJobId != null}
        title={t('jobs.cancelConfirmTitle')}
        description={t('jobs.cancelConfirmBody')}
        confirmLabel={t('actions.cancel')}
        cancelLabel={t('actions.close')}
        danger
        busy={controls.busy}
        onConfirm={() => {
          if (controls.cancelJobId) {
            void controls.cancelJob(controls.cancelJobId);
          }
        }}
        onCancel={() => {
          controls.setCancelJobId(null);
        }}
      />
    </div>
  );
}
