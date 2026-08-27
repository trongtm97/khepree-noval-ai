import type { TermScope } from '@shared/constants/term';
import {
  LOCKED_PROJECT_BOOST,
  TERM_SCOPE_PRIORITY,
} from '@shared/constants/term';
import type { TermRow } from '../db/repositories/term-repository';
import {
  adaptersForSourceLanguage,
  collectMatchKeys,
  termSourceText,
  type LanguageTermAdapter,
} from './term-language-adapter';

export interface TermMatchContext {
  projectId?: string;
  genre?: string | null;
  userId?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
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
  /** Map match-key → representative term (highest priority). */
  bySource: Map<string, TermRow>;
  scanTerms: { key: string; term: TermRow }[];
}

export function buildTermMatchIndex(
  terms: TermRow[],
  options?: {
    sourceLanguage?: string;
    adapters?: readonly LanguageTermAdapter[];
  },
): TermMatchIndex {
  const adapters =
    options?.adapters ?? adaptersForSourceLanguage(options?.sourceLanguage);
  const bySource = new Map<string, TermRow>();

  for (const term of terms) {
    for (const key of collectMatchKeys(term, adapters)) {
      const existing = bySource.get(key);
      if (!existing || termEffectivePriority(term) > termEffectivePriority(existing)) {
        bySource.set(key, term);
      }
    }
  }

  const scanTerms = [...bySource.entries()]
    .map(([key, term]) => ({ key, term }))
    .sort((a, b) => b.key.length - a.key.length);

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
  if (context.sourceLanguage && term.source_language) {
    if (normalizeLang(term.source_language) !== normalizeLang(context.sourceLanguage)) {
      return false;
    }
  }
  if (context.targetLanguage && term.target_language) {
    if (normalizeLang(term.target_language) !== normalizeLang(context.targetLanguage)) {
      return false;
    }
  }

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

function normalizeLang(code: string): string {
  return code.trim().toLowerCase();
}

export function matchKnownTermsInText(
  text: string,
  index: TermMatchIndex,
  allTerms: TermRow[],
  context: TermMatchContext,
): ResolvedTermMatch[] {
  const matches: ResolvedTermMatch[] = [];
  const covered = new Uint8Array(text.length);
  const adapters = adaptersForSourceLanguage(
    context.sourceLanguage ?? allTerms[0]?.source_language,
  );

  const candidatesByKey = new Map<string, TermRow[]>();
  for (const term of allTerms) {
    for (const key of collectMatchKeys(term, adapters)) {
      const list = candidatesByKey.get(key) ?? [];
      list.push(term);
      candidatesByKey.set(key, list);
    }
  }

  for (const { key, term } of index.scanTerms) {
    if (!key) continue;

    const pool = candidatesByKey.get(key) ?? [term];
    const resolved = resolveTermConflict(pool, context);
    if (!resolved) continue;

    let pos = 0;
    while (pos < text.length) {
      const idx = text.indexOf(key, pos);
      if (idx < 0) break;
      const end = idx + key.length;
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
          sourceText: termSourceText(resolved) || key,
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
