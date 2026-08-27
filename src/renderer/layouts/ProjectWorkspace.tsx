import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useT } from '../i18n';
import { Button } from '../components/ui';
import { useUiShellStore } from '../stores/ui-shell-store';

const PROJECT_TABS = [
  { end: true, key: 'projectNav.overview', segment: '' },
  { end: false, key: 'projectNav.chapters', segment: 'chapters' },
  { end: false, key: 'projectNav.translate', segment: 'translate' },
  { end: false, key: 'projectNav.aiMemory', segment: 'ai-memory' },
  { end: false, key: 'projectNav.terms', segment: 'terms' },
  { end: false, key: 'projectNav.characters', segment: 'characters' },
  { end: false, key: 'projectNav.export', segment: 'export' },
] as const;

export function projectTabKeyFromPath(pathname: string): string {
  const match = pathname.match(/^\/projects\/[^/]+(?:\/([^/]+))?/);
  const segment = match?.[1] ?? '';
  if (!segment || segment === 'info') return 'projectNav.overview';
  if (segment === 'source' || segment === 'chapters') return 'projectNav.chapters';
  if (segment === 'translate') return 'projectNav.translate';
  if (segment === 'ai-memory') return 'projectNav.aiMemory';
  if (segment === 'terms') return 'projectNav.terms';
  if (segment === 'characters') return 'projectNav.characters';
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
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId = '' } = useParams();
  const currentProjectName = useUiShellStore((s) => s.currentProjectName);
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    void window.novelTrans.projects
      .get(projectId)
      .then((result) => {
        if (!alive || !result.project) return;
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
  const flush = isProjectTranslatePath(location.pathname);

  return (
    <div className={flush ? 'project-workspace project-workspace--flush' : 'project-workspace'}>
      <div className="project-workspace-header">
        <div className="project-workspace-title-row">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigate('/projects');
            }}
          >
            <ArrowLeft size={16} aria-hidden />
            {t('projectNav.backToProjects')}
          </Button>
          <h1 className="project-workspace-title">
            {currentProjectName ?? t('projectNav.untitled')}
          </h1>
        </div>
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
