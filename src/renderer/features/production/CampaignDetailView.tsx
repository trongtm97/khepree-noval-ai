import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import type {
  CampaignDetailDto,
  CampaignProjectRuntimeDto,
} from '@shared/schemas/translation-campaign';
import type { TranslationCampaignStatus } from '@shared/constants/translation-campaign';
import { CAMPAIGN_STAGE_UI_KEYS } from '@shared/utils/campaign-production';
import { shouldShowCampaignEta } from '@shared/utils/campaign-production';
import { Button, Card, Dialog, Select, Skeleton } from '../../components/ui';
import { useT } from '../../i18n';
import { formatEtaMinutes } from './CampaignListCard';
import { JOB_PRIORITY, type PriorityBand } from '../jobs/jobs-utils';

export interface CampaignDetailViewProps {
  campaign: CampaignDetailDto | null;
  loading: boolean;
  error: string | null;
  displayStatus: TranslationCampaignStatus | null;
  busy?: boolean;
  onBack: () => void;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onCancel: () => Promise<void>;
  onRetryLoad: () => void;
  onProjectControl: (
    projectId: string,
    action: 'pause' | 'resume' | 'retry' | 'setPriority',
    priority?: number,
  ) => Promise<void>;
}

function stageLabel(
  stage: string | null,
  t: (key: string) => string,
): string {
  if (!stage) return t('production.stage.unknown');
  const key =
    CAMPAIGN_STAGE_UI_KEYS[stage as keyof typeof CAMPAIGN_STAGE_UI_KEYS];
  if (!key) return t('production.stage.unknown');
  return t(`production.stage.${key}`);
}

export function CampaignDetailView({
  campaign,
  loading,
  error,
  displayStatus,
  busy,
  onBack,
  onPause,
  onResume,
  onCancel,
  onRetryLoad,
  onProjectControl,
}: CampaignDetailViewProps) {
  const t = useT();
  const navigate = useNavigate();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const projects = campaign?.projects ?? [];
  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 112,
    overscan: 8,
    getItemKey: (i) => projects[i]?.projectId ?? i,
  });

  const showEta = useMemo(
    () =>
      campaign
        ? shouldShowCampaignEta({
            estimateBasis: campaign.estimateBasis,
            estimatedMinutesMin: campaign.estimatedMinutesMin,
            estimatedMinutesMax: campaign.estimatedMinutesMax,
          })
        : false,
    [campaign],
  );

  if (loading && !campaign) {
    return (
      <div aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (error && !campaign) {
    return (
      <div className="production-empty" role="alert">
        <p>{t('production.detailError')}</p>
        <p className="muted">{error}</p>
        <div className="btn-row">
          <Button variant="secondary" onClick={onBack}>
            {t('production.backToList')}
          </Button>
          <Button onClick={onRetryLoad}>{t('production.retryLoad')}</Button>
        </div>
      </div>
    );
  }

  if (!campaign || !displayStatus) return null;

  const eta = showEta
    ? formatEtaMinutes(
        campaign.estimatedMinutesMin,
        campaign.estimatedMinutesMax,
        t,
      )
    : null;

  const canPause =
    displayStatus === 'RUNNING' || displayStatus === 'STARTING';
  const canResume = displayStatus === 'PAUSED';
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(displayStatus);
  const useVirtual = projects.length > 50;

  return (
    <div className="production-campaign-detail">
      <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
        <Button variant="secondary" size="sm" onClick={onBack}>
          {t('production.backToList')}
        </Button>
      </div>

      <header className="production-detail-header">
        <div>
          <h2 style={{ margin: 0 }}>{campaign.title}</h2>
          <p className="muted">
            <span aria-label={t('production.statusAria')}>
              {t(`production.status.${displayStatus}`, {}) !==
              `production.status.${displayStatus}`
                ? t(`production.status.${displayStatus}`)
                : displayStatus}
            </span>
            {' · '}
            {(campaign.recipeName ?? campaign.recipeId) +
              ` (${campaign.recipeMode})`}
            {' · '}
            {campaign.progressPercent}%
            {eta ? (
              <>
                {' · '}
                <span title={t('production.etaEstimateHint')}>
                  {t('production.etaEstimateLabel')}: {eta}
                </span>
              </>
            ) : null}
          </p>
          {campaign.startedAt ? (
            <p className="muted">
              {t('production.startedAt', {
                t: new Date(campaign.startedAt).toLocaleString(),
              })}
            </p>
          ) : null}
        </div>
        <div className="btn-row">
          {canPause ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void onPause();
              }}
            >
              {t('production.pause')}
            </Button>
          ) : null}
          {canResume ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void onResume();
              }}
            >
              {t('production.resume')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => { setConfirmCancel(true); }}
            >
              {t('production.cancel')}
            </Button>
          ) : null}
        </div>
      </header>

      <div
        className="production-progress production-progress--lg"
        role="progressbar"
        aria-valuenow={campaign.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="production-progress__bar"
          style={{ width: `${campaign.progressPercent}%` }}
        />
        <span className="production-progress__label">
          {t('production.countsLine', {
            done: String(campaign.completedCount),
            running: String(campaign.runningCount),
            attention: String(campaign.attentionCount),
            total: String(campaign.projectCount),
          })}
        </span>
      </div>

      <h3 className="production-section-title">{t('production.novelsTitle')}</h3>

      {projects.length === 0 ? (
        <p className="muted">{t('production.noNovels')}</p>
      ) : useVirtual ? (
        <div ref={listRef} className="production-project-virtual" role="list">
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const project = projects[row.index];
              return (
                <div
                  key={row.key}
                  role="listitem"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${row.start}px)`,
                    height: `${row.size}px`,
                    paddingBottom: 8,
                  }}
                >
                  <ProjectRuntimeCard
                    project={project}
                    busy={busy}
                    onOpen={() => { navigate(`/projects/${project.projectId}`); }}
                    onControl={onProjectControl}
                    stageLabel={stageLabel(project.stage, t)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="jobs-card-list" role="list">
          {projects.map((project) => (
            <div key={project.projectId} role="listitem">
              <ProjectRuntimeCard
                project={project}
                busy={busy}
                onOpen={() => { navigate(`/projects/${project.projectId}`); }}
                onControl={onProjectControl}
                stageLabel={stageLabel(project.stage, t)}
              />
            </div>
          ))}
        </div>
      )}

      <details
        className="production-advanced"
        open={showAdvanced}
        onToggle={(e) => { setShowAdvanced((e.target as HTMLDetailsElement).open); }}
      >
        <summary>{t('production.advancedToggle')}</summary>
        {campaign.advanced ? (
          <p className="muted">
            {t('production.advancedLine', {
              ready: String(campaign.advanced.accountsReady),
              total: String(campaign.advanced.accountsTotal),
              inflight: String(campaign.advanced.jobsInFlight),
              max: String(campaign.advanced.maxConcurrent ?? '—'),
            })}
          </p>
        ) : (
          <p className="muted">{t('production.advancedEmpty')}</p>
        )}
      </details>

      <Dialog
        open={confirmCancel}
        title={t('production.cancelConfirmTitle')}
        description={t('production.cancelConfirmBody')}
        confirmLabel={t('production.cancel')}
        cancelLabel={t('actions.cancel')}
        danger
        busy={busy}
        onConfirm={() => {
          void onCancel().finally(() => { setConfirmCancel(false); });
        }}
        onCancel={() => { setConfirmCancel(false); }}
      />
    </div>
  );
}

function ProjectRuntimeCard({
  project,
  busy,
  onOpen,
  onControl,
  stageLabel: stageText,
}: {
  project: CampaignProjectRuntimeDto;
  busy?: boolean;
  onOpen: () => void;
  onControl: (
    projectId: string,
    action: 'pause' | 'resume' | 'retry' | 'setPriority',
    priority?: number,
  ) => Promise<void>;
  stageLabel: string;
}) {
  const t = useT();
  const band: PriorityBand =
    project.priority <= JOB_PRIORITY.high
      ? 'high'
      : project.priority >= JOB_PRIORITY.low
        ? 'low'
        : 'normal';

  return (
    <Card className="production-project-card">
      <div className="production-campaign-card__row">
        <div className="production-campaign-card__main">
          <strong>{project.title}</strong>
          <p className="muted production-campaign-card__meta">
            {t(`production.projectStatus.${project.status}`, {}) !==
            `production.projectStatus.${project.status}`
              ? t(`production.projectStatus.${project.status}`)
              : project.status}
            {' · '}
            {stageText}
            {' · '}
            {project.progressPercent}%
            {project.providerShort || project.accountShort
              ? ` · ${[project.providerShort, project.accountShort].filter(Boolean).join(' / ')}`
              : ''}
            {project.attentionCount > 0
              ? ` · ${t('production.attentionBadge', { n: String(project.attentionCount) })}`
              : ''}
          </p>
          <div className="btn-row" style={{ marginTop: '0.35rem' }}>
            <label className="jobs-priority-field">
              <span className="muted">{t('jobs.priority')}</span>
              <Select
                value={band}
                disabled={busy}
                aria-label={t('production.setPriorityAria', {
                  title: project.title,
                })}
                onChange={(e) => {
                  const next = e.target.value as PriorityBand;
                  void onControl(
                    project.projectId,
                    'setPriority',
                    JOB_PRIORITY[next],
                  );
                }}
              >
                <option value="high">{t('jobs.priorityHigh')}</option>
                <option value="normal">{t('jobs.priorityNormal')}</option>
                <option value="low">{t('jobs.priorityLow')}</option>
              </Select>
            </label>
          </div>
        </div>
        <div className="jobs-card-actions btn-row">
          <Button size="sm" variant="secondary" onClick={onOpen}>
            {t('production.openProject')}
          </Button>
          {project.canPause ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void onControl(project.projectId, 'pause')}
            >
              {t('production.pause')}
            </Button>
          ) : null}
          {project.canRetry ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void onControl(project.projectId, 'retry')}
            >
              {t('production.retry')}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
