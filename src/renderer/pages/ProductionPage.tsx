import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { AttentionInboxPanel } from '../features/jobs/AttentionInboxPanel';
import { AiAccountSection } from '../features/jobs/AiAccountSection';
import { JobDetailDrawer } from '../features/jobs/JobDetailDrawer';
import { JobsBulkBar } from '../features/jobs/JobsBulkBar';
import { JobsOverflowMenu } from '../features/jobs/JobsOverflowMenu';
import { JobsSummaryStrip } from '../features/jobs/JobsSummaryStrip';
import { ProjectQueueSection } from '../features/jobs/ProjectQueueSection';
import { RecentJobsSection } from '../features/jobs/RecentJobsSection';
import { RunningJobCard } from '../features/jobs/RunningJobCard';
import {
  collectManageableJobIds,
  routingPreferenceLabel,
} from '../features/jobs/jobs-utils';
import { useJobsControls } from '../features/jobs/useJobsControls';
import { useJobsOverview } from '../features/jobs/useJobsOverview';
import { CampaignListPanel } from '../features/production/CampaignListPanel';
import { CampaignDetailView } from '../features/production/CampaignDetailView';
import {
  useCampaignDetail,
  useCampaignList,
  type ProductionTab,
} from '../features/production/useCampaignProduction';
import { ModalPortal } from '../components/overlay/ModalPortal';
import { TranslationCampaignWizard } from '../components/TranslationCampaignWizard';
import { BatchImportPreflightWizard } from '../components/BatchImportPreflightWizard';

function parseTab(raw: string | null): ProductionTab {
  if (raw === 'queue' || raw === 'attention' || raw === 'campaigns') return raw;
  return 'campaigns';
}

export function ProductionPage() {
  const t = useT();
  const navigate = useNavigate();
  const { campaignId } = useParams<{ campaignId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  const overview = useJobsOverview();
  const controls = useJobsControls(overview.refresh);
  const campaignList = useCampaignList();
  const detail = useCampaignDetail(campaignId);
  const [inboxOpenCount, setInboxOpenCount] = useState(0);
  const [busyControl, setBusyControl] = useState(false);
  const [showCampaignWizard, setShowCampaignWizard] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await window.khepreeNovelAI.attentionInbox.countOpen();
        if (!cancelled) setInboxOpenCount(res.openCount);
      } catch {
        if (!cancelled) setInboxOpenCount(0);
      }
    };
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const setTab = useCallback(
    (next: ProductionTab) => {
      const params = new URLSearchParams(searchParams);
      params.set('tab', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const accountOrder = useMemo(
    () => new Map(overview.accounts.map((a, i) => [a.id, i])),
    [overview.accounts],
  );
  const aiRoutingLabel = routingPreferenceLabel(overview.aiPreference, t);
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

  const errInfo = controls.error
    ? friendlyError(controls.error)
    : wizardError
      ? friendlyError(wizardError)
      : null;

  if (campaignId) {
    return (
      <div className="jobs-page production-page">
        <CampaignDetailView
          campaign={detail.campaign}
          loading={detail.loading}
          error={detail.error}
          displayStatus={detail.displayStatus}
          busy={busyControl}
          onBack={() => navigate('/jobs?tab=campaigns')}
          onPause={async () => {
            setBusyControl(true);
            try {
              await detail.runControl('pause');
            } finally {
              setBusyControl(false);
            }
          }}
          onResume={async () => {
            setBusyControl(true);
            try {
              await detail.runControl('resume');
            } finally {
              setBusyControl(false);
            }
          }}
          onCancel={async () => {
            setBusyControl(true);
            try {
              await detail.runControl('cancel');
            } finally {
              setBusyControl(false);
            }
          }}
          onRetryLoad={() => {
            void detail.refresh();
          }}
          onProjectControl={async (projectId, action, priority) => {
            setBusyControl(true);
            try {
              await window.khepreeNovelAI.translationCampaign.controlProject({
                campaignId,
                projectId,
                action,
                priority,
              });
              await detail.refresh();
            } catch (err: unknown) {
              detail.setError(
                err instanceof Error ? err.message : t('errors.UNKNOWN.title'),
              );
            } finally {
              setBusyControl(false);
            }
          }}
        />
      </div>
    );
  }

  if (overview.loading && tab !== 'campaigns') {
    return (
      <div className="jobs-page production-page">
        <PageHeader
          title={t('production.title')}
          description={t('production.subtitle')}
        />
        <Skeleton height={72} />
      </div>
    );
  }

  return (
    <div className="jobs-page production-page">
      <PageHeader
        title={t('production.title')}
        description={t('production.subtitle')}
        actions={
          <div className="jobs-header-actions btn-row">
            {tab === 'queue' && overview.scheduler?.paused ? (
              <Button
                disabled={controls.busy}
                onClick={() => {
                  void controls.resumeAll();
                }}
              >
                {t('jobs.resumeAll')}
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

      <div
        className="production-tabs"
        role="tablist"
        aria-label={t('production.tabsAria')}
      >
        {(
          [
            [
              'campaigns',
              t('production.tabCampaigns'),
              t('production.tabCampaignsHelp'),
              campaignList.campaigns.length,
              false,
            ],
            [
              'queue',
              t('production.tabQueue'),
              t('production.tabQueueHelp'),
              overview.runningCount + overview.waitingCount,
              false,
            ],
            [
              'attention',
              t('production.tabAttention'),
              t('production.tabAttentionHelp'),
              Math.max(overview.attentionJobs.length, inboxOpenCount),
              true,
            ],
          ] as const
        ).map(([id, label, help, count, alert]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`production-tab-${id}`}
            title={help}
            aria-selected={tab === id}
            aria-controls={`production-panel-${id}`}
            className={
              tab === id
                ? 'production-tab production-tab--active'
                : 'production-tab'
            }
            onClick={() => setTab(id)}
          >
            <span>{label}</span>
            <span
              className={
                alert && count > 0
                  ? 'production-tab-count production-tab-count--alert'
                  : 'production-tab-count'
              }
              aria-label={String(count)}
            >
              {count > 99 ? '99+' : count}
            </span>
          </button>
        ))}
      </div>

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

      <div
        id={`production-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`production-tab-${tab}`}
      >
        {tab === 'campaigns' ? (
          <CampaignListPanel
            campaigns={campaignList.campaigns}
            loading={campaignList.loading}
            error={campaignList.error}
            onOpen={(id) => navigate(`/jobs/campaigns/${id}`)}
            onCreateCampaign={() => setShowCampaignWizard(true)}
            onImportMany={() => setShowBatchImport(true)}
            onRetry={() => {
              void campaignList.refresh();
            }}
          />
        ) : null}

        {tab === 'queue' ? (
          <>
            <JobsSummaryStrip
              runningCount={overview.runningCount}
              waitingCount={overview.waitingCount}
              attentionCount={Math.max(
                overview.attentionJobs.length,
                inboxOpenCount,
              )}
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
            {overview.runningJobs.length > 0 ? (
              <section aria-labelledby="jobs-running-heading">
                <SectionHeader
                  id="jobs-running-heading"
                  title={t('jobs.runningTitle')}
                />
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
                          await window.khepreeNovelAI.accounts.openBrowser(
                            accountId,
                            'gemini',
                          );
                          return { message: t('jobs.openedGemini') };
                        });
                      }}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            <ProjectQueueSection
              aiRoutingLabel={aiRoutingLabel}
              queuedByProject={overview.queuedByProject}
              titleFor={overview.titleFor}
              busy={controls.busy}
              selectedJobIds={controls.selectedJobIds}
              onToggleSelect={controls.toggleJobSelection}
              onSetPriority={(jobIds, band) => {
                void controls.setProjectQueuePriority(jobIds, band);
              }}
            />
            <AiAccountSection />
            <RecentJobsSection
              jobs={overview.recentJobs}
              titleFor={overview.titleFor}
              busy={controls.busy}
              selectedJobIds={controls.selectedJobIds}
              onToggleSelect={controls.toggleJobSelection}
            />
          </>
        ) : null}

        {tab === 'attention' ? (
          <>
            <AttentionInboxPanel
              onOpenCountChange={setInboxOpenCount}
              onNavigateLogin={(accountId) => {
                navigate(
                  accountId ? `/accounts?focus=${accountId}` : '/accounts',
                );
              }}
              onOpenProject={(projectId) => {
                navigate(`/projects/${projectId}`);
              }}
              onChooseSource={(projectId) => {
                navigate(`/projects/${projectId}/chapters`);
              }}
              onSwitchProvider={(accountId) => {
                navigate(
                  accountId ? `/accounts?focus=${accountId}` : '/accounts',
                );
              }}
              onOpenFolder={(projectId) => {
                void window.khepreeNovelAI.sourceFolder
                  .openFolder(projectId)
                  .catch(() => {
                    navigate(`/projects/${projectId}/chapters`);
                  });
              }}
              onRefreshJobs={() => {
                void overview.refresh();
              }}
            />
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
            {overview.attentionJobs.length === 0 && inboxOpenCount === 0 ? (
              <div className="production-empty">
                <h3>{t('production.attentionEmptyTitle')}</h3>
                <p className="muted">{t('production.attentionEmptyBody')}</p>
                <Button onClick={() => setTab('campaigns')}>
                  {t('production.tabCampaigns')}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

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
            await window.khepreeNovelAI.accounts.openBrowser(accountId, 'gemini');
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

      <ModalPortal
        open={showCampaignWizard}
        onBackdropClick={() => setShowCampaignWizard(false)}
        contentClassName="projects-wizard-modal"
      >
        <TranslationCampaignWizard
          projects={overview.projects.map((p) => ({
            id: p.id,
            title: p.title,
          }))}
          onClose={() => setShowCampaignWizard(false)}
          onStarted={() => {
            void campaignList.refresh();
            setShowCampaignWizard(false);
          }}
          onError={(message) => setWizardError(message)}
        />
      </ModalPortal>

      <ModalPortal
        open={showBatchImport}
        onBackdropClick={() => setShowBatchImport(false)}
        contentClassName="projects-wizard-modal"
      >
        <BatchImportPreflightWizard
          onClose={() => setShowBatchImport(false)}
          onError={(message) => setWizardError(message)}
        />
      </ModalPortal>
    </div>
  );
}
