import { useNavigate } from 'react-router-dom';
import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import { measureJobProgress } from '@shared/utils/job-progress';
import { Button, Card, ProgressBar, SectionHeader } from '../../components/ui';
import { useT } from '../../i18n';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { jobProviderLabel } from '../../features/jobs/job-provider-ui';

export interface RunningJobsSectionProps {
  jobs: JobDto[];
  projects: ProjectDto[];
  totalRunning?: number;
}

export function RunningJobsSection({ jobs, projects, totalRunning }: RunningJobsSectionProps) {
  const t = useT();
  const navigate = useNavigate();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);

  if (jobs.length === 0) return null;

  const projectTitle = (id: string) => projects.find((p) => p.id === id)?.title ?? id;
  const runningCount = totalRunning ?? jobs.length;

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-running-heading">
      <SectionHeader
        id="dashboard-running-heading"
        title={t('dashboard.translatingNow')}
        description={
          runningCount > 1
            ? t('dashboard.jobsRunningSummary', { count: runningCount })
            : undefined
        }
      />
      <ul className="dashboard-job-list">
        {jobs.map((job) => {
          const measure = measureJobProgress(job);
          const range =
            job.chapterFrom != null && job.chapterTo != null
              ? `${job.chapterFrom}–${job.chapterTo}`
              : job.chapterFrom != null
                ? String(job.chapterFrom)
                : '—';
          const paragraphPart = measure.labelParts.find((p) => p.includes('/'));
          const progressLabel = paragraphPart ?? t('dashboard.translatingProgress');
          const provider = jobProviderLabel(job);

          return (
            <li key={job.id}>
              <Card className="dashboard-job-card">
                <div className="dashboard-job-card__header">
                  <div>
                    <strong>{projectTitle(job.projectId)}</strong>
                    <p className="muted dashboard-job-card__range">{range}</p>
                  </div>
                </div>
                {paragraphPart ? (
                  <p className="dashboard-job-card__detail">{paragraphPart}</p>
                ) : null}
                {provider ? (
                  <p className="muted dashboard-job-card__detail">
                    {t('dashboard.runningJobProvider', { provider })}
                  </p>
                ) : null}
                <ProgressBar
                  value={measure.percent}
                  indeterminate={measure.indeterminate}
                  label={progressLabel}
                />
                <div className="dashboard-job-card__actions btn-row">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void window.khepreeNovelAI.jobs.pauseAll().then(() => {
                        navigate('/jobs');
                      });
                    }}
                  >
                    {t('actions.pause')}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setCurrentProject(job.projectId, projectTitle(job.projectId));
                      navigate(`/projects/${job.projectId}/translate`);
                    }}
                  >
                    {t('dashboard.openTranslator')}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {runningCount > jobs.length ? (
        <div className="dashboard-section__footer">
          <Button variant="ghost" size="sm" onClick={() => {
            navigate('/jobs');
          }}>
            {t('dashboard.viewAllJobs')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
