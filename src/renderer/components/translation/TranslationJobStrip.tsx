import type { JobDto } from '@shared/schemas/job';
import { measureJobProgress } from '@shared/utils/job-progress';
import { useT } from '../../i18n';

interface TranslationJobStripProps {
  job: JobDto | null;
  preparing: boolean;
  preparingMessage?: string | null;
}

/** Compact inline job status for command bar (<=28px). */
export function TranslationJobStrip({ job, preparing, preparingMessage }: TranslationJobStripProps) {
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

  const paraLabel =
    typeof job.progress?.paragraphsDone === 'number' &&
    typeof job.progress.paragraphsTotal === 'number' &&
    job.progress.paragraphsTotal > 0
      ? `${job.progress.paragraphsDone}/${job.progress.paragraphsTotal}`
      : null;

  return (
    <div className="translation-job-strip" role="status">
      <span>
        {t('translation.jobStripActive', { range, paras: paraLabel ?? '…' })}
      </span>
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
    </div>
  );
}
