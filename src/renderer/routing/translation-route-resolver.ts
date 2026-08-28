import { isProjectTranslatePath } from '../layouts/ProjectWorkspace';

export interface TranslationDestinationInput {
  lastTranslationProjectId: string | null;
  currentProjectId: string | null;
  knownProjectIds?: readonly string[];
}

export interface TranslationDestination {
  kind: 'translate' | 'pick';
  path: string;
  projectId: string | null;
}

/** Resolve where global "Dịch truyện" navigation should land. */
export function resolveTranslationDestination(
  input: TranslationDestinationInput,
): TranslationDestination {
  const candidates = [input.lastTranslationProjectId, input.currentProjectId].filter(
    (id): id is string => Boolean(id),
  );
  const known = input.knownProjectIds;
  const projectId =
    candidates.find((id) => !known || known.includes(id)) ?? candidates[0] ?? null;

  if (projectId) {
    return {
      kind: 'translate',
      path: `/projects/${projectId}/translate`,
      projectId,
    };
  }

  return { kind: 'pick', path: '/translation/pick', projectId: null };
}

/** True when app shell should enter translation focus mode (minimal chrome). */
export function isTranslationFocusPath(pathname: string): boolean {
  return (
    pathname === '/translation' ||
    pathname === '/editor' ||
    pathname === '/translation/pick' ||
    isProjectTranslatePath(pathname)
  );
}

/** Sidebar "Dịch truyện" active when user is in any translation context. */
export function isTranslationNavActive(pathname: string): boolean {
  return isTranslationFocusPath(pathname);
}
