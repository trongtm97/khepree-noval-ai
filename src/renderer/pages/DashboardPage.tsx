import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, Circle } from 'lucide-react';
import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import {
  isJobActive,
  isJobAttention,
  isJobCompleted,
  measureJobProgress,
} from '@shared/utils/job-progress';
import { useT } from '../i18n';
import { statusLabel } from '../i18n/status';
import {
  PageHeader,
  Card,
  ProgressBar,
  Skeleton,
  EmptyState,
  SectionHeader,
  Button,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { useUiShellStore } from '../stores/ui-shell-store';
import { OnboardingChecklistPanel } from '../hooks/useOnboardingChecklist';
import { LanguagePairLabel } from '../components/LanguagePairLabel';

function formatCount(n: number): string {
  return n.toLocaleString('vi-VN');
}

function HealthMark({
  ok,
  warn,
  label,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
}) {
  if (ok) {
    return (
      <span className="cc-health-item cc-health-item--ok">
        <Check size={14} aria-hidden />
        {label}
      </span>
    );
  }
  if (warn) {
    return (
      <span className="cc-health-item cc-health-item--warn">
        <AlertTriangle size={14} aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <span className="cc-health-item cc-health-item--missing">
      <Circle size={14} aria-hidden />
      {label}
    </span>
  );
}

export function DashboardPage() {
  const t = useT();
  const navigate = useNavigate();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cancelled = { current: false };
    void (async () => {
      try {
        const [projectRes, jobRes] = await Promise.all([
          window.novelTrans.projects.list(),
          window.novelTrans.jobs.list(undefined),
        ]);
        if (cancelled.current) return;
        setProjects(projectRes.projects);
        setJobs(jobRes.jobs);
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

  const focusProjects = useMemo(() => {
    return [...projects]
      .filter((p) => p.status !== 'archived')
      .sort((a, b) => {
        const aLeft =
          (a.sourceChapterCount ?? 0) - (a.translatedChapterCount ?? 0);
        const bLeft =
          (b.sourceChapterCount ?? 0) - (b.translatedChapterCount ?? 0);
        if (aLeft !== bLeft) return bLeft - aLeft;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, 5);
  }, [projects]);

  const running = useMemo(
    () => jobs.filter((j) => isJobActive(j.state)).slice(0, 8),
    [jobs],
  );
  const attention = useMemo(
    () => jobs.filter((j) => isJobAttention(j.state)).slice(0, 8),
    [jobs],
  );
  const recentDone = useMemo(() => {
    return jobs
      .filter((j) => isJobCompleted(j.state))
      .sort((a, b) => {
        const aAt = a.completedAt ?? a.updatedAt;
        const bAt = b.completedAt ?? b.updatedAt;
        return bAt.localeCompare(aAt);
      })
      .slice(0, 6);
  }, [jobs]);

  const projectTitle = (id: string) => projects.find((p) => p.id === id)?.title ?? id;

  const openTranslate = (project: ProjectDto) => {
    setCurrentProject(project.id, project.title);
    navigate(`/projects/${project.id}/translate`);
  };

  if (loading) {
    return (
      <div>
        <PageHeader
          title={t('dashboard.title')}
          description={t('dashboard.subtitle')}
          actions={<HelpContextButton articleId="quick-start" />}
        />
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  return (
    <div className="command-center">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.subtitle')}
        actions={<HelpContextButton articleId="quick-start" />}
      />

      <OnboardingChecklistPanel />

      <SectionHeader title={t('dashboard.nextUp')} />
      {focusProjects.length === 0 ? (
        <EmptyState
          title={t('dashboard.noProjects')}
          description={t('dashboard.noProjectsHint')}
          actionLabel={t('actions.createProject')}
          onAction={() => {
            navigate('/projects');
          }}
        />
      ) : (
        <div className="cc-next-list">
          {focusProjects.map((project) => {
            const source = project.sourceChapterCount ?? 0;
            const done = project.translatedChapterCount ?? 0;
            const next = project.nextUntranslatedChapter;
            const health = project.health;
            const memoryLabel =
              health?.memoryVersion != null
                ? t('dashboard.healthMemoryVer', {
                    version: String(health.memoryVersion),
                    mark: health.memoryVerified ? ' ✓' : '',
                  })
                : t('dashboard.healthMemory');

            return (
              <Card key={project.id} className="cc-next-card">
                <div className="cc-next-main">
                  <div>
                    <h3 className="cc-next-title">{project.title}</h3>
                    <p className="cc-next-pair">
                      <LanguagePairLabel
                        sourceLanguage={project.sourceLanguage}
                        targetLanguage={project.targetLanguage}
                      />
                    </p>
                    <p className="cc-next-progress">
                      {t('dashboard.translatedOfTotal', {
                        done: formatCount(done),
                        total: formatCount(source),
                      })}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => {
                      openTranslate(project);
                    }}
                  >
                    {next != null
                      ? t('dashboard.continueFromChapter', {
                          chapter: String(next),
                        })
                      : done >= source && source > 0
                        ? t('dashboard.openProject')
                        : t('actions.continueTranslate')}
                  </Button>
                </div>
                <div className="cc-health-row" aria-label={t('dashboard.projectHealth')}>
                  <HealthMark
                    ok={health?.source === 'ok'}
                    warn={health?.source === 'warn'}
                    label={t('dashboard.healthSource')}
                  />
                  <HealthMark
                    ok={health?.google === 'ok'}
                    warn={health?.google === 'warn'}
                    label={t('dashboard.healthGoogle')}
                  />
                  <HealthMark
                    ok={health?.notebook === 'ok'}
                    warn={health?.notebook === 'warn'}
                    label={t('dashboard.healthNotebook')}
                  />
                  <HealthMark
                    ok={Boolean(health?.memoryVerified)}
                    warn={health?.memoryVersion != null && !health.memoryVerified}
                    label={memoryLabel}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SectionHeader title={t('dashboard.runningJobs')} />
      {running.length === 0 ? (
        <EmptyState title={t('dashboard.noJobs')} />
      ) : (
        <div className="cc-job-list">
          {running.map((job) => {
            const measure = measureJobProgress(job);
            const range =
              job.chapterFrom != null && job.chapterTo != null
                ? `${job.chapterFrom}–${job.chapterTo}`
                : '—';
            const friendlyParts = measure.labelParts.filter(
              (part) => part.includes('/') && !part.includes('_'),
            );
            const detail =
              friendlyParts.length > 0
                ? `${friendlyParts.join(' · ')} · ${statusLabel(job.state)}`
                : statusLabel(job.state);
            return (
              <Card key={job.id}>
                <div className="page-header-row">
                  <div>
                    <strong>{projectTitle(job.projectId)}</strong>
                    <p className="muted" style={{ margin: '0.15rem 0' }}>
                      {range} · {detail}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCurrentProject(job.projectId, projectTitle(job.projectId));
                      navigate('/jobs');
                    }}
                  >
                    {t('actions.viewDetails')}
                  </Button>
                </div>
                <ProgressBar
                  value={measure.percent}
                  indeterminate={measure.indeterminate}
                  label={detail}
                />
              </Card>
            );
          })}
        </div>
      )}

      <SectionHeader title={t('dashboard.actionRequired')} />
      {attention.length === 0 ? (
        <EmptyState title={t('dashboard.noActionRequired')} />
      ) : (
        <div className="cc-job-list">
          {attention.map((job) => (
            <Card key={job.id}>
              <div className="page-header-row">
                <div>
                  <strong>{projectTitle(job.projectId)}</strong>
                  <p className="muted" style={{ margin: '0.15rem 0' }}>
                    {statusLabel(job.state)}
                    {job.chapterFrom != null
                      ? ` · ${job.chapterFrom}–${job.chapterTo ?? job.chapterFrom}`
                      : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setCurrentProject(job.projectId, projectTitle(job.projectId));
                    navigate('/jobs');
                  }}
                >
                  {t('actions.handle')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionHeader title={t('dashboard.recentCompletion')} />
      {recentDone.length === 0 ? (
        <EmptyState title={t('dashboard.noRecentCompletion')} />
      ) : (
        <ul className="cc-recent-list">
          {recentDone.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                className="nt-btn nt-btn--ghost nt-btn--sm"
                style={{ padding: 0, height: 'auto' }}
                onClick={() => {
                  setCurrentProject(job.projectId, projectTitle(job.projectId));
                  navigate(`/projects/${job.projectId}/translate`);
                }}
              >
                {projectTitle(job.projectId)}
                {job.chapterFrom != null
                  ? ` · ${job.chapterFrom}–${job.chapterTo ?? job.chapterFrom}`
                  : ''}
                {' · '}
                {statusLabel(job.state)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
