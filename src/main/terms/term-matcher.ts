import type { TermScope } from '@shared/constants/term';
import {
  LOCKED_PROJECT_BOOST,
  TERM_SCOPE_PRIORITY,
} from '@shared/constants/term';
import type { TermRow } from '../db/repositories/term-repository';

export interface TermMatchContext {
  projectId?: string;
  genre?: string | null;
  userId?: string;
}

export interface ResolvedTermMatch {
  sourceText: string;
  term: TermRow;
  scope: TermScope;
  effectivePriority: number;
  startIndex: number;
  endIndex: number;
  contextSnippet: string;
}

export interface TermMatchIndex {
  bySource: Map<string, TermRow>;
  scanTerms: TermRow[];
}

export function buildTermMatchIndex(terms: TermRow[]): TermMatchIndex {
  const bySource = new Map<string, TermRow>();
  for (const term of terms) {
    const key = term.source_simplified;
    const existing = bySource.get(key);
    if (!existing || termEffectivePriority(term) > termEffectivePriority(existing)) {
      bySource.set(key, term);
    }
  }
  const scanTerms = [...bySource.values()].sort(
    (a, b) => b.source_simplified.length - a.source_simplified.length,
  );
  return { bySource, scanTerms };
}

export function termEffectivePriority(term: TermRow): number {
  const scope = term.scope as TermScope;
  let score = TERM_SCOPE_PRIORITY[scope];
  if (scope === 'PROJECT' && term.locked === 1) {
    score += LOCKED_PROJECT_BOOST;
  }
  if (term.status === 'LOCKED') {
    score += 50;
  }
  return score;
}

export function resolveTermConflict(
  candidates: TermRow[],
  context: TermMatchContext,
): TermRow | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;

  const projectLocked = candidates.filter(
    (t) => t.scope === 'PROJECT' && t.locked === 1 && t.scope_ref === context.projectId,
  );
  if (projectLocked.length > 0) {
    return (
      projectLocked.sort((a, b) => termEffectivePriority(b) - termEffectivePriority(a))[0] ??
      null
    );
  }

  let best: TermRow | null = null;
  let bestScore = -1;
  for (const term of candidates) {
    if (!termMatchesContext(term, context)) continue;
    const score = termEffectivePriority(term);
    if (score > bestScore) {
      bestScore = score;
      best = term;
    }
  }
  return best;
}

function termMatchesContext(term: TermRow, context: TermMatchContext): boolean {
  const scope = term.scope as TermScope;
  switch (scope) {
    case 'PROJECT':
      return !context.projectId || term.scope_ref === context.projectId;
    case 'GENRE':
      return !context.genre || !term.genre || term.genre === context.genre;
    case 'USER':
      return !context.userId || term.scope_ref === context.userId;
    case 'CONTEXT':
    case 'GLOBAL':
      return true;
    default:
      return true;
  }
}

export function matchKnownTermsInText(
  text: string,
  index: TermMatchIndex,
  allTerms: TermRow[],
  context: TermMatchContext,
): ResolvedTermMatch[] {
  const matches: ResolvedTermMatch[] = [];
  const covered = new Uint8Array(text.length);

  const candidatesBySource = new Map<string, TermRow[]>();
  for (const term of allTerms) {
    const list = candidatesBySource.get(term.source_simplified) ?? [];
    list.push(term);
    candidatesBySource.set(term.source_simplified, list);
  }

  for (const term of index.scanTerms) {
    const source = term.source_simplified;
    if (!source) continue;

    const pool = candidatesBySource.get(source) ?? [term];
    const resolved = resolveTermConflict(pool, context);
    if (!resolved) continue;

    let pos = 0;
    while (pos < text.length) {
      const idx = text.indexOf(source, pos);
      if (idx < 0) break;
      const end = idx + source.length;
      let overlap = false;
      for (let i = idx; i < end; i += 1) {
        if (covered[i]) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        for (let i = idx; i < end; i += 1) covered[i] = 1;
        matches.push({
          sourceText: source,
          term: resolved,
          scope: resolved.scope as TermScope,
          effectivePriority: termEffectivePriority(resolved),
          startIndex: idx,
          endIndex: end,
          contextSnippet: snippetAround(text, idx, end),
        });
      }
      pos = idx + 1;
    }
  }

  return matches.sort((a, b) => a.startIndex - b.startIndex);
}

function snippetAround(text: string, start: number, end: number, radius = 20): string {
  const s = Math.max(0, start - radius);
  const e = Math.min(text.length, end + radius);
  return text.slice(s, e);
}
