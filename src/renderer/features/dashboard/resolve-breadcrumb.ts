export interface BreadcrumbCurrentProject {
  id: string;
  name: string;
}

export interface BreadcrumbSegment {
  /** i18n key; omit when using `text` only. */
  labelKey?: string;
  /** Raw segment text (e.g. project title). */
  text?: string;
}

/**
 * Canonical breadcrumb for AppShell topbar.
 * Global routes must NOT append stale project names.
 */
export function resolveBreadcrumb(
  pathname: string,
  currentProject: BreadcrumbCurrentProject | null,
): BreadcrumbSegment[] {
  if (pathname === '/') {
    return [{ labelKey: 'nav.dashboard' }];
  }

  if (pathname === '/projects') {
    return [{ labelKey: 'nav.projects' }];
  }

  if (/^\/projects\/[^/]+/.test(pathname)) {
    const segments: BreadcrumbSegment[] = [{ labelKey: 'nav.projects' }];
    if (currentProject?.name) {
      segments.push({ text: currentProject.name });
    }
    return segments;
  }

  if (
    pathname === '/translation' ||
    pathname.startsWith('/translation/') ||
    pathname === '/editor'
  ) {
    const segments: BreadcrumbSegment[] = [{ labelKey: 'nav.translation' }];
    if (currentProject?.name) {
      segments.push({ text: currentProject.name });
    }
    return segments;
  }

  if (pathname === '/jobs' || pathname.startsWith('/jobs/')) {
    return [{ labelKey: 'nav.jobs' }];
  }

  const ROUTE_KEYS: Record<string, string> = {
    '/accounts': 'nav.accounts',
    '/logs': 'nav.logs',
    '/help': 'nav.help',
    '/settings': 'nav.settings',
    '/learning': 'nav.learning',
    '/diagnostics': 'nav.diagnostics',
  };

  const direct = ROUTE_KEYS[pathname];
  if (direct) {
    return [{ labelKey: direct }];
  }

  if (pathname.startsWith('/help/')) {
    return [{ labelKey: 'nav.help' }];
  }

  return [{ labelKey: 'nav.dashboard' }];
}
