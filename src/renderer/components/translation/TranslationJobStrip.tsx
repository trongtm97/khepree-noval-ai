import type { JobDto } from '@shared/schemas/job';
import { measureJobProgress } from '@shared/utils/job-progress';
import { useT } from '../../i18n';
import { Button } from '../ui';
import {
  jobProviderLabel,
  readJobFallbackNotice,
} from '../../features/jobs/job-provider-ui';

interface TranslationJobStripProps {
  job: JobDto | null;
  preparing: boolean;
  preparingMessage?: string | null;
  onPause?: () => void;
  onResume?: () => void;
}

/** Compact inline job status below command bar. */
export function TranslationJobStrip({
  job,
  preparing,
  preparingMessage,
  onPause,
  onResume,
}: TranslationJobStripProps) {
  const t = useT();

  if (preparing && !job) {
    return (
      <span className="translation-job-strip" role="status">
        {preparingMessage ?? t('translation.ensuringReady')}
      </span>
    );
  }

  if (!job) return null;

  const measure = measureJobProgress(job);
  const range =
    job.chapterFrom != null && job.chapterTo != null
      ? `${job.chapterFrom}–${job.chapterTo}`
      : job.chapterFrom != null
        ? String(job.chapterFrom)
        : '…';

  const provider = jobProviderLabel(job);
  const done = job.progress?.paragraphsDone;
  const total = job.progress?.paragraphsTotal;
  const paraLabel =
    typeof done === 'number' && typeof total === 'number' && total > 0
      ? t('translation.jobStripParas', { done: String(done), total: String(total) })
      : null;
  const fallbackNotice = readJobFallbackNotice(job, t);
  const paused = job.state === 'PAUSED';

  const activeLabel = provider
    ? t('translation.jobStripActiveWithProvider', { range, provider })
    : t('translation.jobStripActive', { range });

  return (
    <div className="translation-job-strip" role="status">
      <span>{activeLabel}</span>
      {paraLabel ? <span>{paraLabel}</span> : null}
      {fallbackNotice ? (
        <span className="translation-job-strip__fallback">{fallbackNotice}</span>
      ) : null}
      <div
        className="translation-job-strip__progress"
        role="progressbar"
        aria-valuenow={
          measure.indeterminate || measure.percent == null ? undefined : measure.percent
        }
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={
            measure.indeterminate
              ? 'translation-job-strip__bar translation-job-strip__bar--indeterminate'
              : 'translation-job-strip__bar'
          }
          style={measure.indeterminate ? undefined : { width: `${measure.percent}%` }}
        />
      </div>
      {paused ? (
        <Button size="sm" variant="ghost" onClick={onResume}>
          {t('actions.resume')}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={onPause}>
          {t('actions.pause')}
        </Button>
      )}
    </div>
  );
}
