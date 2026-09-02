import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import { useT } from '../i18n';
import { Button, EmptyState, ProgressBar, Skeleton } from '../components/ui';
import { LanguagePairLabel } from '../components/LanguagePairLabel';
import { useUiShellStore } from '../stores/ui-shell-store';

/** Compact project picker when no recent translation session exists. */
export function TranslationPickPage() {
  const t = useT();
  const navigate = useNavigate();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const lastTranslationProjectId = useUiShellStore((s) => s.lastTranslationProjectId);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.khepreeNovelAI.projects
      .list()
      .then((result) => {
        setProjects(result.projects);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const sorted = [...projects].sort((a, b) => {
    if (a.id === lastTranslationProjectId) return -1;
    if (b.id === lastTranslationProjectId) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const openTranslate = useCallback(
    (project: ProjectDto) => {
      setCurrentProject(project.id, project.title);
      navigate(`/projects/${project.id}/translate`);
    },
    [navigate, setCurrentProject],
  );

  if (loading) {
    return (
      <div className="translation-pick-page">
        <Skeleton height={28} width="40%" />
        <div className="translation-pick-list">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={72} />
          ))}
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="translation-pick-page">
        <EmptyState
          title={t('translationPick.emptyTitle')}
          description={t('translationPick.emptyDescription')}
          actionLabel={t('translationPick.createProject')}
          onAction={() => {
            navigate('/projects');
          }}
        />
      </div>
    );
  }

  return (
    <div className="translation-pick-page">
      <header className="translation-pick-header">
        <h1>{t('translationPick.title')}</h1>
        <p className="muted">{t('translationPick.subtitle')}</p>
      </header>

      <ul className="translation-pick-list" role="list">
        {sorted.map((project) => {
          const total = project.sourceChapterCount ?? 0;
          const done = project.translatedChapterCount ?? 0;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          return (
            <li key={project.id} className="translation-pick-item">
              <div className="translation-pick-item__main">
                <strong className="translation-pick-item__title">{project.title}</strong>
                <LanguagePairLabel
                  sourceLanguage={project.sourceLanguage}
                  targetLanguage={project.targetLanguage}
                  className="translation-pick-item__pair"
                />
                <div className="translation-pick-item__progress">
                  <ProgressBar value={pct} />
                  <span className="muted">
                    {t('dashboard.translatedOfTotal', {
                      done: String(done),
                      total: String(total),
                    })}
                  </span>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  openTranslate(project);
                }}
              >
                {t('actions.continueTranslate')}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
