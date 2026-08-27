import { useEffect, useState } from 'react';
import type { JobDto } from '@shared/schemas/job';
import { measureJobProgress } from '@shared/utils/job-progress';
import { useT } from '../../i18n';
import { Button, ProgressBar } from '../ui';

interface JobProgressBannerProps {
  job: JobDto | null;
  preparing: boolean;
  preparingMessage?: string | null;
  onPause: () => void;
}

/**
 * Active translation job — chapters, paragraphs, account, pause.
 */
export function JobProgressBanner({
  job,
  preparing,
  preparingMessage,
  onPause,
}: JobProgressBannerProps) {
  const t = useT();
  const [accountLabel, setAccountLabel] = useState<string | null>(null);

  useEffect(() => {
    const accountId = job?.progress?.accountId;
    if (!accountId || typeof accountId !== 'string') {
      setAccountLabel(null);
      return;
    }
    let alive = true;
    void window.novelTrans.accounts
      .list()
      .then((res) => {
        if (!alive) return;
        const idx = res.accounts.findIndex((a) => a.id === accountId);
        if (idx >= 0) {
          const account = res.accounts[idx];
          const custom = account?.label?.trim();
          setAccountLabel(custom && custom.length > 0 ? custom : String(idx + 1));
          return;
        }
        setAccountLabel(accountId.slice(0, 6));
      })
      .catch(() => {
        if (alive) setAccountLabel(accountId.slice(0, 6));
      });
    return () => {
      alive = false;
    };
  }, [job?.progress?.accountId]);

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
      : job.chapterFrom != null
        ? t('translation.jobBannerRange', {
            from: String(job.chapterFrom),
            to: String(job.chapterFrom),
          })
        : t('translation.translating');

  const paraLabel =
    typeof job.progress?.paragraphsDone === 'number' &&
    typeof job.progress.paragraphsTotal === 'number' &&
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
        {accountLabel ? (
          <span className="muted">
            {t('translation.jobBannerAccount', { label: accountLabel })}
          </span>
        ) : null}
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
      </div>
    </div>
  );
}

/** @deprecated Use JobProgressBanner */
export { JobProgressBanner as TranslationJobBanner };
