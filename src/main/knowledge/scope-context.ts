import type { DatabaseManager } from '../db/database-manager';
import type { TermScope } from '@shared/constants/term';
import { TERM_SCOPE_PRIORITY } from '@shared/constants/term';

/** Resolved scope keys for a translation job / memory build. */
export interface KnowledgeScopeContext {
  projectId: string;
  seriesId: string | null;
  genre: string | null;
  chapterIds: string[];
  /** Primary chapter for CHAPTER-scoped terms (first in batch). */
  chapterId: string | null;
}

export function resolveKnowledgeScopeContext(
  db: DatabaseManager,
  projectId: string,
  chapterIds: string[] = [],
): KnowledgeScopeContext {
  const project = db.projects.getById(projectId);
  const membership = db.fictionSeries.getVolumeByProject(projectId);
  const series =
    membership ? db.fictionSeries.getSeriesById(membership.series_id) : null;
  const chapterId = chapterIds[0] ?? null;
  return {
    projectId,
    seriesId: membership?.series_id ?? null,
    genre: project?.genre ?? series?.genre ?? null,
    chapterIds,
    chapterId,
  };
}

export interface ScopedTermProvenance {
  termId: string;
  scope: TermScope;
  scopeRef: string | null;
  layer: TermScope;
}

export function termScopeLayer(scope: TermScope): TermScope {
  return scope;
}

export function compareTermScopePriority(a: TermScope, b: TermScope): number {
  return TERM_SCOPE_PRIORITY[a] - TERM_SCOPE_PRIORITY[b];
}
