import { useNavigate } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import type { JobDto } from '@shared/schemas/job';
import { isJobActive, measureJobProgress } from '@shared/utils/job-progress';
import { LanguagePairLabel } from '../../components/LanguagePairLabel';
import { Badge, Button, ProgressBar } from '../../components/ui';
import { useT } from '../../i18n';
import { formatRelativeDate } from '../../utils/format-relative-date';
import {
  projectProgressPercent,
  resolveProjectDisplayState,
  resolveProjectHealthAlert,
  type ProjectHealthAlert,
} from './project-status';
import { ProjectActionsMenu } from './ProjectActionsMenu';

export interface ProjectCardProps {
  project: ProjectDto;
  activeJob?: JobDto | null;
  isCurrent?: boolean;
  onOpenProject: (project: ProjectDto) => void;
  onContinueTranslate: (project: ProjectDto) => void;
  onDelete: (project: ProjectDto) => void;
  onSetCurrentProject: (id: string, title: string) => void;
}

function ProjectProgressSection({ project }: { project: ProjectDto }) {
  const t = useT();
  const total = project.sourceChapterCount ?? 0;
  const done = project.translatedChapterCount ?? 0;
  const pct = projectProgressPercent(project);
  const updated = formatRelativeDate(project.updatedAt);

  return (
    <div className="project-card-progress">
      <div className="project-card-progress__stats">
        <span className="project-card-progress__chapters">
          {t('projects.totalChapters', {
            done: String(done),
            total: String(total),
          })}
        </span>
        <span className="project-card-progress__pct" aria-hidden>
          {pct}%
        </span>
      </div>
      <ProgressBar value={pct} label={project.title} />
      <span className="project-card-progress__updated muted">
        {t('projects.updatedLabel', {
          when: t(updated.key, updated.params),
        })}
      </span>
    </div>
  );
}

function ActiveJobBanner({
  job,
  onMonitor,
}: {
  job: JobDto;
  onMonitor: () => void;
}) {
  const t = useT();
  const measure = measureJobProgress(job);
  const range =
    job.chapterFrom != null && job.chapterTo != null
      ? t('projects.translatingChapterRange', {
          from: String(job.chapterFrom),
          to: String(job.chapterTo),
        })
      : null;
  const segments =
    measure.labelParts.find((p) => p.includes('/')) ?? null;

  return (
    <div className="project-card-job-banner">
      <div className="project-card-job-banner__text">
        {range ? <span>{range}</span> : null}
        {segments ? <span className="muted">{segments}</span> : null}
      </div>
      <Button size="sm" variant="ghost" onClick={onMonitor}>
        {t('projects.monitorJob')}
      </Button>
    </div>
  );
}

function HealthAlertBanner({
  alert,
  projectId,
  onSetCurrentProject,
  projectTitle,
}: {
  alert: ProjectHealthAlert;
  projectId: string;
  projectTitle: string;
  onSetCurrentProject: (id: string, title: string) => void;
}) {
  const t = useT();
  const navigate = useNavigate();

  const handle = () => {
    onSetCurrentProject(projectId, projectTitle);
    const route = alert.actionRoute;
    if (route === 'accounts') navigate('/accounts');
    else if (route === 'chapters') navigate(`/projects/${projectId}/chapters`);
    else if (route === 'ai-memory') navigate(`/projects/${projectId}/ai-memory`);
    else if (route === 'jobs') navigate('/jobs');
  };

  return (
    <div className="project-card-health-alert">
      <span>{t(alert.messageKey)}</span>
      {alert.actionKey ? (
        <Button size="sm" variant="ghost" onClick={handle}>
          {t(alert.actionKey)}
        </Button>
      ) : null}
    </div>
  );
}

function ProjectPrimaryActions({
  project,
  activeJob,
  displayStatus,
  onOpenProject,
  onContinueTranslate,
}: {
  project: ProjectDto;
  activeJob?: JobDto | null;
  displayStatus: ReturnType<typeof resolveProjectDisplayState>;
  onOpenProject: (project: ProjectDto) => void;
  onContinueTranslate: (project: ProjectDto) => void;
}) {
  const t = useT();
  const done = project.translatedChapterCount ?? 0;
  const translating = activeJob && isJobActive(activeJob.state);

  if (translating) {
    return (
      <div className="project-card-actions">
        <Button variant="secondary" size="sm" onClick={() => { onOpenProject(project); }}>
          {t('projects.openTranslator')}
        </Button>
      </div>
    );
  }

  const continueLabel =
    done > 0 ? t('actions.continueTranslateArrow') : t('actions.startTranslateArrow');

  return (
    <div className="project-card-actions">
      <Button variant="secondary" size="sm" onClick={() => { onOpenProject(project); }}>
        {t('actions.openProject')}
      </Button>
      {displayStatus.status === 'error' && displayStatus.actionable ? (
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            onContinueTranslate(project);
          }}
        >
          {t(displayStatus.actionKey ?? 'projects.actionViewError')}
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            onContinueTranslate(project);
          }}
        >
          {continueLabel}
        </Button>
      )}
    </div>
  );
}

function ProjectCardHeader({
  project,
  displayStatus,
  isCurrent,
  onOpenProject,
  onDelete,
  onSetCurrentProject,
}: {
  project: ProjectDto;
  displayStatus: ReturnType<typeof resolveProjectDisplayState>;
  isCurrent?: boolean;
  onOpenProject: (project: ProjectDto) => void;
  onDelete: (project: ProjectDto) => void;
  onSetCurrentProject: (id: string, title: string) => void;
}) {
  const t = useT();

  return (
    <div className="project-card-header">
      <div className="project-card-header__main">
        <button
          type="button"
          className="project-card-title"
          title={project.title}
          onClick={() => {
            onOpenProject(project);
          }}
        >
          {project.title}
        </button>
        <LanguagePairLabel
          sourceLanguage={project.sourceLanguage}
          targetLanguage={project.targetLanguage}
          variant="inline"
          className="project-card-pair muted"
        />
      </div>
      <div className="project-card-header__meta">
        {isCurrent ? (
          <span className="project-card-current muted">{t('projects.currentlyOpen')}</span>
        ) : null}
        <Badge tone={displayStatus.tone}>{t(displayStatus.labelKey)}</Badge>
        <ProjectActionsMenu
          project={project}
          onDelete={() => {
            onDelete(project);
          }}
          onSetCurrentProject={onSetCurrentProject}
        />
      </div>
    </div>
  );
}

export function ProjectListItem(props: ProjectCardProps) {
  const t = useT();
  const navigate = useNavigate();
  const { project, activeJob, isCurrent } = props;
  const displayStatus = resolveProjectDisplayState(project, activeJob);
  const healthAlert = resolveProjectHealthAlert(project);
  const nextChapter = project.nextUntranslatedChapter;

  const cardClass = [
    'project-card',
    'project-card--list',
    isCurrent ? 'project-card--current' : '',
    displayStatus.status === 'error' ? 'project-card--error' : '',
    displayStatus.status === 'needs_setup' ? 'project-card--warn' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardClass}>
      <ProjectCardHeader {...props} displayStatus={displayStatus} />
      {displayStatus.hintKey ? (
        <p className="project-card-hint muted">{t(displayStatus.hintKey)}</p>
      ) : null}
      {healthAlert ? (
        <HealthAlertBanner
          alert={healthAlert}
          projectId={project.id}
          projectTitle={project.title}
          onSetCurrentProject={props.onSetCurrentProject}
        />
      ) : null}
      {activeJob && isJobActive(activeJob.state) ? (
        <ActiveJobBanner
          job={activeJob}
          onMonitor={() => {
            props.onSetCurrentProject(project.id, project.title);
            navigate('/jobs');
          }}
        />
      ) : null}
      <div className="project-card-body">
        <ProjectProgressSection project={project} />
        <div className="project-card-footer">
          {nextChapter != null ? (
            <span className="project-card-next muted">
              {t('projects.nextChapter', { chapter: String(nextChapter) })}
            </span>
          ) : (
            <span />
          )}
          <ProjectPrimaryActions
            project={project}
            activeJob={activeJob}
            displayStatus={displayStatus}
            onOpenProject={props.onOpenProject}
            onContinueTranslate={props.onContinueTranslate}
          />
        </div>
      </div>
    </article>
  );
}

export function ProjectGridCard(props: ProjectCardProps) {
  const t = useT();
  const navigate = useNavigate();
  const { project, activeJob, isCurrent } = props;
  const displayStatus = resolveProjectDisplayState(project, activeJob);
  const healthAlert = resolveProjectHealthAlert(project);
  const done = project.translatedChapterCount ?? 0;
  const translating = activeJob && isJobActive(activeJob.state);

  const cardClass = [
    'project-card',
    'project-card--grid',
    isCurrent ? 'project-card--current' : '',
    displayStatus.status === 'error' ? 'project-card--error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const continueLabel =
    done > 0 ? t('actions.continueTranslateArrow') : t('actions.startTranslateArrow');

  return (
    <article className={cardClass}>
      <ProjectCardHeader {...props} displayStatus={displayStatus} />
      {displayStatus.hintKey ? (
        <p className="project-card-hint muted">{t(displayStatus.hintKey)}</p>
      ) : null}
      {healthAlert ? (
        <HealthAlertBanner
          alert={healthAlert}
          projectId={project.id}
          projectTitle={project.title}
          onSetCurrentProject={props.onSetCurrentProject}
        />
      ) : null}
      <ProjectProgressSection project={project} />
      {activeJob && isJobActive(activeJob.state) ? (
        <ActiveJobBanner
          job={activeJob}
          onMonitor={() => {
            props.onSetCurrentProject(project.id, project.title);
            navigate('/jobs');
          }}
        />
      ) : null}
      <div className="project-card-grid-actions">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            props.onOpenProject(project);
          }}
        >
          {t('actions.openProject')}
        </Button>
        {translating ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              props.onOpenProject(project);
            }}
          >
            {t('projects.openTranslator')}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              props.onContinueTranslate(project);
            }}
          >
            {continueLabel}
          </Button>
        )}
      </div>
    </article>
  );
}
