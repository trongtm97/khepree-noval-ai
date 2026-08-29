import { useT } from '../../i18n';

export interface JobsSummaryStripProps {
  runningCount: number;
  waitingCount: number;
  attentionCount: number;
  usableWorkers: number;
  pausedCount: number;
  inFlight?: number;
  maxConcurrent?: number;
  schedulerPaused?: boolean;
}

export function JobsSummaryStrip({
  runningCount,
  waitingCount,
  attentionCount,
  usableWorkers,
  pausedCount,
  inFlight,
  maxConcurrent,
  schedulerPaused,
}: JobsSummaryStripProps) {
  const t = useT();
  const slotsLabel =
    typeof inFlight === 'number' && typeof maxConcurrent === 'number'
      ? t('jobs.statSlots', {
          inFlight: String(inFlight),
          max: String(maxConcurrent),
        })
      : null;

  return (
    <div className="jobs-summary-strip" role="region" aria-label={t('jobs.summaryAria')}>
      {schedulerPaused ? (
        <div className="jobs-summary-item jobs-summary-item--paused">
          <span className="jobs-summary-icon" aria-hidden>
            ⏸
          </span>
          <span className="jobs-summary-label">{t('jobs.schedulerPausedBadge')}</span>
        </div>
      ) : null}
      <div className="jobs-summary-item">
        <span className="jobs-summary-icon jobs-summary-icon--running" aria-hidden>
          ●
        </span>
        <span className="jobs-summary-label">{t('jobs.statRunning')}</span>
        <strong className="jobs-summary-value">{runningCount}</strong>
      </div>
      <div className="jobs-summary-item">
        <span className="jobs-summary-icon" aria-hidden>
          ⏳
        </span>
        <span className="jobs-summary-label">{t('jobs.statQueued')}</span>
        <strong className="jobs-summary-value">{waitingCount}</strong>
      </div>
      {pausedCount > 0 ? (
        <div className="jobs-summary-item">
          <span className="jobs-summary-icon" aria-hidden>
            ○
          </span>
          <span className="jobs-summary-label">{t('jobs.statPaused')}</span>
          <strong className="jobs-summary-value">{pausedCount}</strong>
        </div>
      ) : null}
      <div className="jobs-summary-item">
        <span className="jobs-summary-icon jobs-summary-icon--attention" aria-hidden>
          ⚠
        </span>
        <span className="jobs-summary-label">{t('jobs.statAttention')}</span>
        <strong className="jobs-summary-value">{attentionCount}</strong>
      </div>
      <div className="jobs-summary-item">
        <span className="jobs-summary-label">{t('jobs.statAiReady')}</span>
        <strong className="jobs-summary-value">{usableWorkers}</strong>
      </div>
      {slotsLabel ? (
        <div className="jobs-summary-item">
          <span className="jobs-summary-label">{t('jobs.statStreams')}</span>
          <strong className="jobs-summary-value">{slotsLabel}</strong>
        </div>
      ) : null}
    </div>
  );
}
