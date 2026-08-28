import { useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import { getLanguageProfile } from '@shared/constants/language-profile';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { LanguagePairLabel } from '../LanguagePairLabel';
import { EditionSwitcher } from '../EditionSwitcher';
import { TooltipPopover } from '../overlay';

export interface CompactProjectBarProps {
  project: ProjectDto | null;
  title: string;
  projectId: string;
  showOpenTranslator?: boolean;
  onProjectChange?: (project: ProjectDto) => void;
}

function languagePairTooltip(sourceLanguage: string, targetLanguage: string): string {
  const source = getLanguageProfile(sourceLanguage);
  const target = getLanguageProfile(targetLanguage);
  return [
    source.internationalName,
    source.nativeName,
    sourceLanguage,
    '→',
    target.internationalName,
    target.nativeName,
    targetLanguage,
  ].join('\n');
}

/** Single-row project context bar (~40–46px). */
export function CompactProjectBar({
  project,
  title,
  projectId,
  showOpenTranslator = true,
  onProjectChange,
}: CompactProjectBarProps) {
  const t = useT();
  const navigate = useNavigate();
  const pairRef = useRef<HTMLSpanElement>(null);

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
        <>
          <span ref={pairRef} className="compact-project-bar__pair-wrap">
            <LanguagePairLabel
              sourceLanguage={project.sourceLanguage}
              targetLanguage={project.targetLanguage}
              className="compact-project-bar__pair"
              variant="compact"
            />
          </span>
          <TooltipPopover
            anchorRef={pairRef}
            content={
              <pre className="language-pair-tooltip">
                {languagePairTooltip(project.sourceLanguage, project.targetLanguage)}
              </pre>
            }
            placement="bottom-start"
          />
        </>
      ) : null}

      <div className="compact-project-bar__spacer" aria-hidden />

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
