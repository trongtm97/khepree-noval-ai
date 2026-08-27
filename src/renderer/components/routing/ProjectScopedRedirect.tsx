import { Navigate } from 'react-router-dom';
import { useUiShellStore } from '../../stores/ui-shell-store';

/** Redirect global project-module URLs into the active project workspace. */
export function ProjectScopedRedirect({ tab }: { tab: string }) {
  const projectId = useUiShellStore((s) => s.currentProjectId);
  if (!projectId) {
    return <Navigate to="/projects" replace />;
  }
  const suffix = tab ? `/${tab}` : '';
  return <Navigate to={`/projects/${projectId}${suffix}`} replace />;
}
