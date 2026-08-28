import { Navigate } from 'react-router-dom';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { resolveTranslationDestination } from '../../routing/translation-route-resolver';

/** Redirect global project-module URLs into the active project workspace. */
export function ProjectScopedRedirect({ tab }: { tab: string }) {
  const lastTranslationProjectId = useUiShellStore((s) => s.lastTranslationProjectId);
  const currentProjectId = useUiShellStore((s) => s.currentProjectId);

  if (tab === 'translate') {
    const dest = resolveTranslationDestination({
      lastTranslationProjectId,
      currentProjectId,
    });
    if (dest.kind === 'pick') {
      return <Navigate to="/translation/pick" replace />;
    }
    return <Navigate to={dest.path} replace />;
  }

  if (!currentProjectId) {
    return <Navigate to="/projects" replace />;
  }
  const suffix = tab ? `/${tab}` : '';
  return <Navigate to={`/projects/${currentProjectId}${suffix}`} replace />;
}
