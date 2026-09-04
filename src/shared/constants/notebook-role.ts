import { NOTEBOOK_NAME_PREFIX } from './notebook';

/** Notebook role: research corpus vs translation knowledge channel. */
export const NOTEBOOK_ROLES = ['SINGLE', 'RESEARCH', 'TRANSLATION'] as const;

export type NotebookRole = (typeof NOTEBOOK_ROLES)[number];

export type NotebookPurpose = 'research' | 'translation';

export type NotebookLayout = 'SINGLE' | 'DUAL';

export const NOTEBOOK_RESEARCH_NAME_PREFIX = '[Research]';
export const NOTEBOOK_TRANSLATION_NAME_PREFIX = '[Translation]';

/** Maps runtime purpose → DB role (SINGLE satisfies both). */
export function roleForPurpose(purpose: NotebookPurpose): Exclude<NotebookRole, 'SINGLE'> {
  return purpose === 'research' ? 'RESEARCH' : 'TRANSLATION';
}

export function formatNotebookNameForRole(
  novelName: string,
  role: NotebookRole,
  options?: { targetLanguage?: string | null; editionTitle?: string | null },
): string {
  const cleaned = novelName.trim().replace(/\s+/g, ' ').slice(0, 120);
  const title = cleaned || 'Untitled';
  if (role === 'RESEARCH') {
    return `${NOTEBOOK_RESEARCH_NAME_PREFIX} ${title}`;
  }
  if (role === 'TRANSLATION') {
    const lang = (options?.targetLanguage ?? '').trim().toUpperCase() || 'VI';
    const editionTitle = (options?.editionTitle ?? title).trim().replace(/\s+/g, ' ').slice(0, 120);
    return `${NOTEBOOK_TRANSLATION_NAME_PREFIX}[${lang}] ${editionTitle || title}`;
  }
  return `${NOTEBOOK_NAME_PREFIX} ${title}`;
}

/** Phase 5: TRANSLATION notebook role deprecated — research-only NotebookLM. */
export const DEPRECATED_NOTEBOOK_ROLES = ['TRANSLATION'] as const;

export type DeprecatedNotebookRole = (typeof DEPRECATED_NOTEBOOK_ROLES)[number];

export function isDeprecatedNotebookRole(role: string | null | undefined): boolean {
  return role === 'TRANSLATION';
}

/** Default role for new NotebookLM mappings (Phase 5). */
export const DEFAULT_NOTEBOOK_ROLE: NotebookRole = 'RESEARCH';

/**
 * HARD REQUIREMENT 18 — coerce unknown / empty legacy role strings.
 * Never throw; older rows may lack a clean enum value.
 */
export function coerceNotebookRole(
  role: string | null | undefined,
): NotebookRole {
  const raw = (role ?? '').trim();
  if ((NOTEBOOK_ROLES as readonly string[]).includes(raw)) {
    return raw as NotebookRole;
  }
  return DEFAULT_NOTEBOOK_ROLE;
}

/** Gemini web chat — used for translate when no legacy Translation notebook. */
export const GEMINI_WEB_CHAT_URL = 'https://gemini.google.com/app';

export function inferNotebookLayout(
  roles: Iterable<NotebookRole>,
): NotebookLayout {
  for (const r of roles) {
    if (r === 'SINGLE') return 'SINGLE';
  }
  return 'DUAL';
}
