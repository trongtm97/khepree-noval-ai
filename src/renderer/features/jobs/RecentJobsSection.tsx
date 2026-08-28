import { useNavigate } from 'react-router-dom';
import type { JobDto } from '@shared/schemas/job';
import { Button, Card, SectionHeader } from '../../components/ui';
import { useT } from '../../i18n';
import { statusLabel } from '../../i18n/status';
import { formatRelativeDate } from '../../utils/format-relative-date';
import { chapterRange } from './jobs-utils';

export interface RecentJobsSectionProps {
  jobs: JobDto[];
  titleFor: (projectId: string) => string;
}

export function RecentJobsSection({ jobs, titleFor }: RecentJobsSectionProps) {
  const t = useT();
  const navigate = useNavigate();

  if (jobs.length === 0) return null;

  return (
    <section aria-labelledby="jobs-recent-heading">
      <SectionHeader id="jobs-recent-heading" title={t('jobs.recentTitle')} />
      <div className="jobs-card-list">
        {jobs.map((job) => {
          const range = chapterRange(job);
          const relative = formatRelativeDate(job.completedAt ?? job.updatedAt);
          const relativeText = relative.params
            ? t(relative.key, relative.params)
            : t(relative.key);
          const stateLabel = statusLabel(job.state);

          return (
            <Card key={job.id} className="jobs-recent-card">
              <div className="jobs-card-row">
                <div className="jobs-card-main">
                  <strong>{titleFor(job.projectId)}</strong>
                  {range ? (
                    <p className="muted jobs-card-sub">
                      {t('jobs.chapterLabel', { range })}
                    </p>
                  ) : null}
                  <p className="muted jobs-card-sub">
                    {stateLabel} · {relativeText}
                  </p>
                </div>
                <div className="jobs-card-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigate(`/projects/${job.projectId}/translate`);
                    }}
                  >
                    {t('jobs.open')}
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
