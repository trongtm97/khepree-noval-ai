import { useNavigate } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import type { ProjectMetadataDto } from '@shared/schemas/book-metadata';
import { projectProgressPercent } from '../projects/project-status';
import { ProgressBar } from '../../components/ui';
import { ReadField } from './MetadataReadView';
import { useT } from '../../i18n';
import type { ProjectNextAction } from './project-next-actions';

interface ProjectOverviewCardsProps {
  project: ProjectDto;
  metadata: ProjectMetadataDto;
  sourceHealthLabelKey: string;
  nextActions: ProjectNextAction[];
}

export function ProjectOverviewCards({
  project,
  metadata,
  sourceHealthLabelKey,
  nextActions,
}: ProjectOverviewCardsProps) {
  const t = useT();
  const navigate = useNavigate();
  const total = metadata.expectedChapterCount ?? project.sourceChapterCount ?? 0;
  const done = project.translatedChapterCount ?? 0;
  const pct = projectProgressPercent(project);

  return (
    <>
      <div className="overview-grid">
        <div className="card overview-card">
          <h3 className="overview-card__title">{t('bookMetadata.infoCardTitle')}</h3>
          <ReadField label={t('bookMetadata.sourceTitle')} value={metadata.sourceTitle} />
          <ReadField label={t('bookMetadata.targetTitle')} value={metadata.targetTitle} />
          <ReadField label={t('bookMetadata.author')} value={metadata.authorName} />
          <ReadField label={t('bookMetadata.genre')} value={metadata.genre} />
          <ReadField
            label={t('bookMetadata.publicationStatus')}
            value={metadata.publicationStatus}
          />
        </div>
        <div className="card overview-card">
          <h3 className="overview-card__title">{t('bookMetadata.progressCardTitle')}</h3>
          <p className="overview-stat">
            {t('bookMetadata.translatedOfTotal', { done, total: total || '—' })}
          </p>
          <ProgressBar value={pct} label={t('bookMetadata.progressCardTitle')} />
          <p className="overview-meta muted">
            {project.nextUntranslatedChapter != null
              ? t('bookMetadata.nextChapter', { n: project.nextUntranslatedChapter })
              : t('bookMetadata.allTranslated')}
          </p>
          <p className="overview-meta">
            {t('bookMetadata.sourceHealth')}: {t(sourceHealthLabelKey)}
          </p>
        </div>
      </div>

      {nextActions.length > 0 ? (
        <div className="card overview-next">
          <h3 className="overview-card__title">{t('bookMetadata.nextTitle')}</h3>
          <ul className="overview-next-list">
            {nextActions.map((action) => (
              <li key={action.id}>
                <span>{t(action.messageKey, action.messageParams)}</span>
                <button
                  type="button"
                  className="nt-btn nt-btn--secondary nt-btn--sm"
                  onClick={() => {
                    navigate(action.route);
                  }}
                >
                  {t(action.actionKey)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
