import type { JobDto } from '@shared/schemas/job';
import { Button, Card, SectionHeader } from '../../components/ui';
import { useT } from '../../i18n';
import {
  chapterRange,
  friendlyJobSummary,
  jobSupportsPartialResume,
} from './jobs-utils';
import { JobSelectCheckbox } from './JobSelectCheckbox';

export interface ActionRequiredJobsProps {
  jobs: JobDto[];
  titleFor: (projectId: string) => string;
  busy: boolean;
  selectedJobIds: Set<string>;
  onToggleSelect: (jobId: string) => void;
  onOpen: (jobId: string) => void;
  onRetry: (jobId: string) => void;
}

export function ActionRequiredJobs({
  jobs,
  titleFor,
  busy,
  selectedJobIds,
  onToggleSelect,
  onOpen,
  onRetry,
}: ActionRequiredJobsProps) {
  const t = useT();
  if (jobs.length === 0) return null;

  return (
    <section aria-labelledby="jobs-attention-heading">
      <SectionHeader
        id="jobs-attention-heading"
        title={t('jobs.needsAttention')}
        description={t('jobs.needsAttentionCount', { n: String(jobs.length) })}
      />
      <div className="jobs-card-list">
        {jobs.map((job) => {
          const range = chapterRange(job);
          const partial = jobSupportsPartialResume(job);
          return (
            <Card key={job.id} className="jobs-attention-card">
              <div className="jobs-card-row">
                <JobSelectCheckbox
                  jobId={job.id}
                  checked={selectedJobIds.has(job.id)}
                  disabled={busy}
                  ariaLabel={t('jobs.selectJobAria', { project: titleFor(job.projectId) })}
                  onToggle={onToggleSelect}
                />
                <div className="jobs-card-main">
                  <strong>{titleFor(job.projectId)}</strong>
                  {range ? (
                    <p className="muted jobs-card-sub">
                      {t('jobs.chapterLabel', { range })}
                    </p>
                  ) : null}
                  <p className="jobs-card-message">{friendlyJobSummary(job, t)}</p>
                </div>
                <div className="jobs-card-actions btn-row">
                  {partial ? (
                    <Button size="sm" disabled={busy} onClick={() => void onRetry(job.id)}>
                      {t('jobs.continueFromError')}
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => void onRetry(job.id)}>
                      {t('actions.retry')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void onOpen(job.id);
                    }}
                  >
                    {t('jobs.detail')}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
