import type { JobDto } from '@shared/schemas/job';
import { measureJobProgress } from '@shared/utils/job-progress';
import { useT } from '../../i18n';
import { Button, ProgressBar } from '../ui';

interface TranslationJobBannerProps {
  job: JobDto | null;
  preparing: boolean;
  preparingMessage?: string | null;
  onPause: () => void;
  onOpenJobs: () => void;
}

export function TranslationJobBanner({
  job,
  preparing,
  preparingMessage,
  onPause,
  onOpenJobs,
}: TranslationJobBannerProps) {
  const t = useT();

  if (preparing && !job) {
    return (
      <div className="translation-job-banner" role="status">
        <span>{preparingMessage ?? t('translation.ensuringReady')}</span>
      </div>
    );
  }

  if (!job) return null;

  const measure = measureJobProgress(job);
  const range =
    job.chapterFrom != null && job.chapterTo != null
      ? t('translation.jobBannerRange', {
          from: String(job.chapterFrom),
          to: String(job.chapterTo),
        })
      : t('translation.translating');

  const paraLabel =
    typeof job.progress?.paragraphsDone === 'number' &&
    typeof job.progress?.paragraphsTotal === 'number' &&
    job.progress.paragraphsTotal > 0
      ? t('translation.jobBannerParagraphs', {
          done: String(job.progress.paragraphsDone),
          total: String(job.progress.paragraphsTotal),
        })
      : null;

  return (
    <div className="translation-job-banner" role="status">
      <div className="translation-job-banner__main">
        <strong>{range}</strong>
        {paraLabel ? <span className="muted">{paraLabel}</span> : null}
        <ProgressBar
          value={measure.percent}
          indeterminate={measure.indeterminate}
          label={paraLabel ?? range}
        />
      </div>
      <div className="translation-job-banner__actions">
        <Button size="sm" onClick={onPause}>
          {t('actions.pause')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenJobs}>
          {t('translation.openJobs')}
        </Button>
      </div>
    </div>
  );
}
