import { NOTEBOOK_NAME_PREFIX } from './notebook';

/** Notebook role: research corpus vs translation knowledge channel. */
export const NOTEBOOK_ROLES = ['SINGLE', 'RESEARCH', 'TRANSLATION'] as const;

export type NotebookRole = (typeof NOTEBOOK_ROLES)[number];

export type NotebookPurpose = 'research' | 'translation';

export type NotebookLayout = 'SINGLE' | 'DUAL';

export const NOTEBOOK_RESEARCH_NAME_PREFIX = '[NovelTrans Research]';

/** Maps runtime purpose → DB role (SINGLE satisfies both). */
export function roleForPurpose(purpose: NotebookPurpose): Exclude<NotebookRole, 'SINGLE'> {
  return purpose === 'research' ? 'RESEARCH' : 'TRANSLATION';
}

export function formatNotebookNameForRole(novelName: string, role: NotebookRole): string {
  const cleaned = novelName.trim().replace(/\s+/g, ' ').slice(0, 120);
  const title = cleaned || 'Untitled';
  if (role === 'RESEARCH') {
    return `${NOTEBOOK_RESEARCH_NAME_PREFIX} ${title}`;
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
