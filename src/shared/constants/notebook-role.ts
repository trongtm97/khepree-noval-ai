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

export function inferNotebookLayout(
  roles: Iterable<NotebookRole>,
): NotebookLayout {
  for (const r of roles) {
    if (r === 'SINGLE') return 'SINGLE';
  }
  return 'DUAL';
}
