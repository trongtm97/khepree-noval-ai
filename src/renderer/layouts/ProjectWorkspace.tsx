import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import { useT } from '../i18n';
import { CompactProjectBar } from '../components/shell/CompactProjectBar';
import { useUiShellStore } from '../stores/ui-shell-store';

export const PROJECT_TABS = [
  { end: true, key: 'projectNav.overview', segment: '' },
  { end: false, key: 'projectNav.chapters', segment: 'chapters' },
  { end: false, key: 'projectNav.terms', segment: 'terms' },
  { end: false, key: 'projectNav.characters', segment: 'characters' },
  { end: false, key: 'projectNav.aiMemory', segment: 'ai-memory' },
  { end: false, key: 'projectNav.data', segment: 'data' },
] as const;

export function projectTabKeyFromPath(pathname: string): string {
  const match = /^\/projects\/[^/]+(?:\/([^/]+))?/.exec(pathname);
  const segment = match?.[1] ?? '';
  if (!segment || segment === 'info') return 'projectNav.overview';
  if (segment === 'source' || segment === 'chapters') return 'projectNav.chapters';
  if (segment === 'translate') return 'nav.translation';
  if (segment === 'ai-memory') return 'projectNav.aiMemory';
  if (segment === 'terms') return 'projectNav.terms';
  if (segment === 'characters') return 'projectNav.characters';
  if (segment === 'data') return 'projectNav.data';
  if (segment === 'export') return 'projectNav.export';
  return 'projectNav.overview';
}

export function isProjectWorkspacePath(pathname: string): boolean {
  return /^\/projects\/[^/]+/.test(pathname);
}

export function isProjectTranslatePath(pathname: string): boolean {
  return /^\/projects\/[^/]+\/translate\/?$/.test(pathname);
}

export function ProjectWorkspace() {
  const t = useT();
  const location = useLocation();
  const { projectId = '' } = useParams();
  const currentProjectName = useUiShellStore((s) => s.currentProjectName);
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const [project, setProject] = useState<ProjectDto | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    void window.novelTrans.projects
      .get(projectId)
      .then((result) => {
        if (!alive) return;
        setProject(result.project);
        setCurrentProject(result.project.id, result.project.title);
      })
      .catch(() => {
        /* keep prior store name; page may show its own error */
      });
    return () => {
      alive = false;
    };
  }, [projectId, setCurrentProject]);

  const base = `/projects/${projectId}`;
  const translationFocus = isProjectTranslatePath(location.pathname);
  const title = project?.title ?? currentProjectName ?? t('projectNav.untitled');

  if (translationFocus) {
    return (
      <div className="project-workspace project-workspace--translation-focus">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="project-workspace">
      <div className="project-workspace-header">
        <CompactProjectBar
          project={project}
          title={title}
          projectId={projectId}
          onProjectChange={setProject}
        />

        <nav className="project-workspace-tabs" aria-label={t('projectNav.tabsLabel')}>
          {PROJECT_TABS.map((tab) => {
            const to = tab.segment ? `${base}/${tab.segment}` : base;
            return (
              <NavLink
                key={tab.key}
                to={to}
                end={tab.end}
                className={({ isActive }) => {
                  const legacyActive =
                    (tab.segment === '' && /\/info\/?$/.test(location.pathname)) ||
                    (tab.segment === 'chapters' && /\/source\/?$/.test(location.pathname));
                  return isActive || legacyActive
                    ? 'project-workspace-tab active'
                    : 'project-workspace-tab';
                }}
              >
                {t(tab.key)}
              </NavLink>
            );
          })}
        </nav>
      </div>
      <div className="project-workspace-body">
        <Outlet />
      </div>
    </div>
  );
}
