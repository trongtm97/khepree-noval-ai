import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, BookOpen, Clock, Bot, BookMarked } from 'lucide-react';
import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import { useT } from '../i18n';
import { statusLabel } from '../i18n/status';
import { PageHeader, Card, ProgressBar, Skeleton, EmptyState, SectionHeader } from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { useUiShellStore } from '../stores/ui-shell-store';

export function DashboardPage() {
  const t = useT();
  const navigate = useNavigate();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [workersReady, setWorkersReady] = useState(0);
  const [workersTotal, setWorkersTotal] = useState(0);
  const [termsCount, setTermsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cancelled = { current: false };
    void (async () => {
      try {
        const [projectRes, jobRes, workerRes, termRes] = await Promise.all([
          window.novelTrans.projects.list(),
          window.novelTrans.jobs.list(undefined),
          window.novelTrans.jobs.workers(),
          window.novelTrans.terms.search({}),
        ]);
        if (cancelled.current) return;
        setProjects(projectRes.projects);
        setJobs(jobRes.jobs);
        const ready = workerRes.workers.filter(
          (w: { health: string }) => w.health === 'READY',
        ).length;
        setWorkersReady(ready);
        setWorkersTotal(workerRes.workers.length);
        setTermsCount(termRes.terms.length);
      } catch (err: unknown) {
        if (!cancelled.current) {
          setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
        }
      } finally {
        if (!cancelled.current) setLoading(false);
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [t]);

  const stats = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'archived').length;
    const chapters = projects.reduce((sum, p) => sum + (p.chapterCount ?? 0), 0);
    const running = jobs.filter((j) =>
      ['RUNNING', 'QUEUED', 'WAITING', 'PAUSED'].includes(j.state),
    );
    return { active, chapters, pending: running.length, running };
  }, [projects, jobs]);

  const projectTitle = (id: string) => projects.find((p) => p.id === id)?.title ?? id;

  if (loading) {
    return (
      <div>
        <PageHeader
          title={t('dashboard.title')}
          description={t('dashboard.subtitle')}
          actions={<HelpContextButton articleId="quick-start" />}
        />
        <div className="card-grid">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={88} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.subtitle')}
        actions={<HelpContextButton articleId="quick-start" />}
      />

      <section className="card-grid" style={{ marginBottom: '1.5rem' }}>
        <Stat icon={<FolderKanban size={18} />} label={t('dashboard.activeProjects')} value={stats.active} />
        <Stat icon={<BookOpen size={18} />} label={t('dashboard.chaptersTranslated')} value={stats.chapters} />
        <Stat icon={<Clock size={18} />} label={t('dashboard.chaptersPending')} value={stats.pending} />
        <Stat
          icon={<Bot size={18} />}
          label={t('dashboard.workersReady')}
          value={`${workersReady}/${workersTotal}`}
        />
        <Stat icon={<BookMarked size={18} />} label={t('dashboard.termsConfirmed')} value={termsCount} />
      </section>

      <SectionHeader title={t('dashboard.runningJobs')} />
      {stats.running.length === 0 ? (
        <EmptyState title={t('dashboard.noJobs')} />
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {stats.running.slice(0, 5).map((job) => {
            const progress =
              job.chapterFrom != null && job.chapterTo != null
                ? Math.min(99, Math.max(5, job.attemptCount * 20))
                : 10;
            return (
              <Card key={job.id}>
                <div className="page-header-row">
                  <div>
                    <strong>{projectTitle(job.projectId)}</strong>
                    <p className="muted" style={{ margin: '0.15rem 0' }}>
                      {job.chapterFrom != null && job.chapterTo != null
                        ? `${job.chapterFrom}–${job.chapterTo}`
                        : '—'}{' '}
                      · {statusLabel(job.state)}
                    </p>
                  </div>
                  <span>{t('dashboard.percent', { value: progress })}</span>
                </div>
                <ProgressBar value={progress} label={statusLabel(job.state)} />
              </Card>
            );
          })}
        </div>
      )}

      <SectionHeader title={t('dashboard.recentActivity')} />
      {jobs.length === 0 ? (
        <EmptyState title={t('dashboard.noActivity')} />
      ) : (
        <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-secondary)' }}>
          {jobs.slice(0, 8).map((job) => (
            <li key={job.id} style={{ marginBottom: '0.4rem' }}>
              <button
                type="button"
                className="nt-btn nt-btn--ghost nt-btn--sm"
                style={{ padding: 0, height: 'auto' }}
                onClick={() => {
                  setCurrentProject(job.projectId, projectTitle(job.projectId));
                  navigate('/jobs');
                }}
              >
                {projectTitle(job.projectId)} · {statusLabel(job.state)}
                {job.chapterFrom != null
                  ? ` · ${job.chapterFrom}–${job.chapterTo ?? job.chapterFrom}`
                  : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="stat-card">
      <p className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        {label}
      </p>
      <p className="stat-value">{value}</p>
    </div>
  );
}
