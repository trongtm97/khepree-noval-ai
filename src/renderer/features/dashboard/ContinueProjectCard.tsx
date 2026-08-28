import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import type { ProjectDto } from '@shared/schemas/import';
import { formatLanguagePairInline } from '@shared/constants/language-profile';
import { Button, Card, ProgressBar } from '../../components/ui';
import { useT } from '../../i18n';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { formatRelativeDate } from '../../utils/format-relative-date';
import {
  isProjectComplete,
  countUntranslatedChapters,
} from './resolve-priority-project';
import { projectProgressPercent } from './dashboard-readiness';

function formatCount(n: number): string {
  return n.toLocaleString('vi-VN');
}

export interface ContinueProjectCardProps {
  project: ProjectDto;
  newChapterCount?: number;
}

export function ContinueProjectCard({ project, newChapterCount = 0 }: ContinueProjectCardProps) {
  const t = useT();
  const navigate = useNavigate();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);

  const source = project.sourceChapterCount ?? 0;
  const done = project.translatedChapterCount ?? 0;
  const next = project.nextUntranslatedChapter;
  const percent = projectProgressPercent(project);
  const complete = isProjectComplete(project);
  const sourceMissing = project.health?.source === 'missing';
  const sourceWarn = project.health?.source === 'warn';
  const hasNoTranslation = done === 0 && source > 0;
  const relative = formatRelativeDate(project.updatedAt);
  const updatedLabel = relative.params
    ? t(relative.key, relative.params)
    : t(relative.key);

  const langPair = formatLanguagePairInline(project.sourceLanguage, project.targetLanguage);

  const openProject = () => {
    setCurrentProject(project.id, project.title);
    navigate(`/projects/${project.id}`);
  };

  const openTranslate = () => {
    setCurrentProject(project.id, project.title);
    navigate(`/projects/${project.id}/translate`);
  };

  const openChapters = () => {
    setCurrentProject(project.id, project.title);
    navigate(`/projects/${project.id}/chapters`);
  };

  const openExport = () => {
    setCurrentProject(project.id, project.title);
    navigate(`/projects/${project.id}/export`);
  };

  let primaryLabel = t('actions.continueTranslate');
  let primaryAction = openTranslate;
  let secondaryLabel: string | null = t('actions.openProject');
  let secondaryAction = openProject;

  if (sourceMissing || sourceWarn) {
    primaryLabel = t('dashboard.actionSelectFolder');
    primaryAction = openChapters;
    secondaryLabel = null;
  } else if (complete && newChapterCount > 0) {
    primaryLabel = t('dashboard.translateNewChapters', { count: newChapterCount });
    primaryAction = openTranslate;
  } else if (complete) {
    primaryLabel = t('dashboard.viewTranslation');
    primaryAction = openTranslate;
    secondaryLabel = t('dashboard.exportNovel');
    secondaryAction = openExport;
  } else if (hasNoTranslation) {
    primaryLabel = t('dashboard.startTranslating');
    primaryAction = openTranslate;
    secondaryLabel = t('actions.openProject');
  } else if (next != null) {
    primaryLabel = t('dashboard.continueFromChapter', { chapter: String(next) });
    primaryAction = openTranslate;
  }

  return (
    <Card className="dashboard-priority-card" as="section" aria-labelledby="dashboard-priority-title">
      <div className="dashboard-priority-card__header">
        <div className="dashboard-priority-card__meta">
          <h2 id="dashboard-priority-title" className="dashboard-priority-card__title">
            {project.title}
          </h2>
          <p className="dashboard-priority-card__lang" title={langPair}>
            {langPair}
          </p>
        </div>
        {complete && newChapterCount === 0 ? (
          <span className="dashboard-priority-card__badge dashboard-priority-card__badge--done">
            <CheckCircle2 size={16} aria-hidden />
            {t('dashboard.translationComplete')}
          </span>
        ) : null}
        {newChapterCount > 0 ? (
          <span className="dashboard-priority-card__badge dashboard-priority-card__badge--new">
            {t('dashboard.newChaptersBadge', { count: newChapterCount })}
          </span>
        ) : null}
      </div>

      {source > 0 ? (
        <>
          <div className="dashboard-priority-card__progress-row">
            <span className="dashboard-priority-card__progress-text">
              {t('dashboard.translatedOfTotal', {
                done: formatCount(done),
                total: formatCount(source),
              })}
            </span>
            <span className="dashboard-priority-card__percent">
              {t('dashboard.percent', { value: String(percent) })}
            </span>
          </div>
          <ProgressBar
            value={percent}
            label={t('dashboard.progressLabel', {
              done: formatCount(done),
              total: formatCount(source),
            })}
          />
        </>
      ) : hasNoTranslation ? (
        <p className="dashboard-priority-card__hint">{t('dashboard.projectReadyHint')}</p>
      ) : null}

      {!complete && next != null && !sourceMissing ? (
        <p className="dashboard-priority-card__next">
          {t('dashboard.nextChapterLabel', { chapter: String(next) })}
        </p>
      ) : null}

      {!complete && source > 0 && next == null && done > 0 ? (
        <p className="dashboard-priority-card__next muted">
          {t('dashboard.remainingChapters', { count: countUntranslatedChapters(project) })}
        </p>
      ) : null}

      <p className="dashboard-priority-card__updated muted">
        {t('dashboard.lastUpdated', { when: updatedLabel })}
      </p>

      <div className="dashboard-priority-card__actions btn-row">
        <Button variant="primary" onClick={primaryAction}>
          {primaryLabel}
        </Button>
        {secondaryLabel ? (
          <Button variant="secondary" onClick={secondaryAction}>
            {secondaryLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
