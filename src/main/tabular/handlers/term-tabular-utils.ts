import type { TermScope, TermStatus } from '@shared/constants/term';
import type { TermRow } from '../../db/repositories/term-repository';
import type { TabularCommitContext } from '../types';

export function pickRow(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parsePipeList(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[|;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function formatPipeList(values: string[]): string {
  return values.join('|');
}

export function resolveScopeRef(
  scope: string,
  scopeRef: string,
  projectId?: string,
): string | null {
  if (scope === 'PROJECT') return scopeRef || (projectId ?? null);
  return scopeRef || null;
}

/** Pair-safe lookup: source_language + target_language + source_text + scope/scope_ref. */
export function findExistingTerm(
  row: Record<string, string>,
  ctx: TabularCommitContext,
): TermRow | null {
  const db = ctx.db;
  const termId = pickRow(row, 'term_id', 'id');
  if (termId && isUuid(termId)) {
    const byId = db.terms.getById(termId);
    if (byId) return byId;
  }

  const sourceText = pickRow(row, 'source_text', 'simplified', 'chinese', 'source');
  if (!sourceText) return null;

  const scope = (pickRow(row, 'scope') || 'GLOBAL').toUpperCase() as TermScope;
  const scopeRef = resolveScopeRef(scope, pickRow(row, 'scope_ref'), ctx.projectId);
  const pair = {
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
  };

  const scoped = db.terms.getBySourceAndScope(sourceText, scope, scopeRef, pair);
  if (scoped) return scoped;

  if (ctx.projectId) {
    return db.terms.findBySource(sourceText, ctx.projectId, pair);
  }
  return null;
}

export function clampImportedStatus(
  requested: string,
  ctx: TabularCommitContext,
): { status: TermStatus; warnings: string[] } {
  const warnings: string[] = [];
  const elevated = requested === 'GLOBAL_VERIFIED' || requested === 'LOCKED';
  const allow = ctx.termImport?.allowElevatedStatus ?? false;

  if (elevated && !allow) {
    const fallback =
      (ctx.termImport?.defaultImportStatus ??
        (ctx.projectId ? 'PROJECT_VERIFIED' : 'CANDIDATE')) as TermStatus;
    warnings.push(`Downgraded ${requested} → ${fallback} (elevated status not allowed)`);
    return { status: fallback, warnings };
  }

  return { status: requested as TermStatus, warnings };
}
