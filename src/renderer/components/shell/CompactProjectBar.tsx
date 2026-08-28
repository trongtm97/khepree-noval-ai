import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { LanguagePairLabel } from '../LanguagePairLabel';
import { EditionSwitcher } from '../EditionSwitcher';

export interface CompactProjectBarProps {
  project: ProjectDto | null;
  title: string;
  projectId: string;
  showOpenTranslator?: boolean;
  onProjectChange?: (project: ProjectDto) => void;
}

/** Single-row project context bar (~40–48px). */
export function CompactProjectBar({
  project,
  title,
  projectId,
  showOpenTranslator = true,
  onProjectChange,
}: CompactProjectBarProps) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div className="compact-project-bar">
      <Button
        variant="ghost"
        size="sm"
        className="compact-project-bar__back"
        onClick={() => {
          navigate('/projects');
        }}
        aria-label={t('projectNav.backToProjects')}
      >
        <ArrowLeft size={16} aria-hidden />
      </Button>

      <span className="compact-project-bar__title" title={title}>
        {title}
      </span>

      {project ? (
        <LanguagePairLabel
          sourceLanguage={project.sourceLanguage}
          targetLanguage={project.targetLanguage}
          className="compact-project-bar__pair"
        />
      ) : null}

      <div className="compact-project-bar__actions">
        {project ? (
          <EditionSwitcher
            projectId={project.id}
            sourceLanguage={project.sourceLanguage}
            onChanged={(targetLanguage, activeEditionId) => {
              onProjectChange?.({
                ...project,
                targetLanguage,
                activeEditionId,
              });
            }}
          />
        ) : null}
        {showOpenTranslator ? (
          <Button
            variant="primary"
            size="sm"
            className="compact-project-bar__open-translator"
            onClick={() => {
              navigate(`/projects/${projectId}/translate`);
            }}
          >
            {t('projectNav.openTranslator')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
