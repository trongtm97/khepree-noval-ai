import { TERM_SCOPES, TERM_STATUSES, normalizeTermType } from '@shared/constants/term';
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  normalizeLanguageCode,
} from '@shared/constants/language-profile';
import {
  TERM_TABULAR_CANDIDATE_STATUSES,
  TERM_TABULAR_COLUMNS,
  TERM_TABULAR_ELEVATED_STATUSES,
  TERM_TABULAR_VERIFIED_STATUSES,
  type TermTabularExportScope,
} from '@shared/constants/term-tabular';
import type { TermScope } from '@shared/constants/term';
import type { DatabaseManager } from '../../db/database-manager';
import type { TermRow } from '../../db/repositories/term-repository';
import { parseJsonStringArray } from '../../terms/term-variant-json';
import type { TabularCommitContext, TabularDataTypeHandler, TabularUndoEntry } from '../types';
import {
  clampImportedStatus,
  findExistingTerm,
  formatPipeList,
  isUuid,
  parsePipeList,
  pickRow,
  resolveScopeRef,
} from './term-tabular-utils';

function boolToCell(value: number | boolean): string {
  return value === 1 || value === true ? '1' : '0';
}

function parseBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function exportTermRow(db: DatabaseManager, term: TermRow): Record<string, string> {
  const translations = db.terms.listTranslations(term.id);
  const primary =
    translations.find((t) => t.is_primary === 1)?.target_text ??
    translations[0]?.target_text ??
    '';
  const altTargets = translations
    .filter((t) => t.is_primary !== 1)
    .map((t) => t.target_text)
    .filter(Boolean);
  const sourceVariants = parseJsonStringArray(term.source_variants);
  const targetVariants = parseJsonStringArray(term.target_variants);

  return {
    term_id: term.id,
    source_language: term.source_language,
    target_language: term.target_language,
    source_text: term.source_text ?? term.source_simplified,
    target_text: primary,
    source_variants: formatPipeList(sourceVariants),
    target_variants: formatPipeList(altTargets.length > 0 ? altTargets : targetVariants),
    transliteration: term.transliteration ?? term.pinyin ?? '',
    transliteration_system: term.transliteration_system ?? '',
    term_type: term.term_type,
    scope: term.scope,
    scope_ref: term.scope_ref ?? '',
    status: term.status,
    locked: boolToCell(term.locked),
    confidence: term.confidence != null ? String(term.confidence) : '',
    occurrence_count: String(term.occurrence_count ?? 0),
    notes: term.notes ?? '',
    simplified: term.source_simplified,
    traditional: term.source_traditional ?? '',
    pinyin: term.pinyin ?? '',
  };
}

function listTermsForExport(ctx: TabularCommitContext): TermRow[] {
  const db = ctx.db;
  const scope: TermTabularExportScope = ctx.termExport?.exportScope ?? 'all_terms';
  const projectId = ctx.projectId;
  const editionId = ctx.editionId;

  let rows: TermRow[];
  switch (scope) {
    case 'current_project': {
      if (!projectId) return [];
      rows = db.terms.listAllForProject(projectId);
      break;
    }
    case 'current_edition': {
      if (!projectId || !editionId) return [];
      const edition = db.translationEditions.getById(editionId);
      if (!edition) return [];
      const project = db.projects.getById(projectId);
      rows = db.terms.listAllForProject(projectId).filter(
        (t) =>
          t.source_language === (project?.source_language ?? t.source_language) &&
          t.target_language === edition.target_language,
      );
      break;
    }
    case 'locked_only':
      rows = db.terms.search({ limit: 100_000, projectId }).filter((t) => t.locked === 1);
      break;
    case 'verified_only':
      rows = db.terms.search({ limit: 100_000, projectId }).filter((t) =>
        (TERM_TABULAR_VERIFIED_STATUSES as readonly string[]).includes(t.status),
      );
      break;
    case 'candidates_only':
      rows = db.terms.search({ limit: 100_000, projectId }).filter((t) =>
        (TERM_TABULAR_CANDIDATE_STATUSES as readonly string[]).includes(t.status),
      );
      break;
    case 'all_terms':
    default:
      rows = db.terms.search({ limit: 100_000, projectId });
      break;
  }
  return rows;
}

export const termsTabularHandler: TabularDataTypeHandler = {
  dataType: 'terms',
  sheetName: 'terms',
  columns: TERM_TABULAR_COLUMNS.map((key) => ({
    key,
    header: key,
    required: key === 'source_text',
  })),

  detectFromHeaders(headers) {
    const set = new Set(headers);
    return (
      (set.has('source_text') || set.has('simplified') || set.has('chinese')) &&
      (set.has('target_text') ||
        set.has('preferred_translation') ||
        set.has('vietnamese'))
    );
  },

  validateRow(row, _rowIndex, ctx) {
    const messages: string[] = [];
    const sourceText = pickRow(row, 'source_text', 'simplified', 'chinese', 'source');
    if (!sourceText) {
      return { status: 'error', messages: ['source_text is required'], normalized: {} };
    }

    const scope = (pickRow(row, 'scope') || (ctx.projectId ? 'PROJECT' : 'GLOBAL')).toUpperCase();
    const scopeRef = pickRow(row, 'scope_ref') || (scope === 'PROJECT' ? ctx.projectId ?? '' : '');

    const rawStatus = (
      pickRow(row, 'status') ||
      ctx.termImport?.defaultImportStatus ||
      (ctx.projectId ? 'PROJECT_VERIFIED' : 'CANDIDATE')
    ).toUpperCase();

    const normalized: Record<string, string> = {
      term_id: pickRow(row, 'term_id', 'id'),
      source_language: normalizeLanguageCode(
        pickRow(row, 'source_language') || ctx.meta?.source_language || DEFAULT_SOURCE_LANGUAGE,
      ),
      target_language: normalizeLanguageCode(
        pickRow(row, 'target_language') || ctx.meta?.target_language || DEFAULT_TARGET_LANGUAGE,
      ),
      source_text: sourceText,
      target_text: pickRow(row, 'target_text', 'preferred_translation', 'vietnamese'),
      source_variants: pickRow(row, 'source_variants'),
      target_variants: pickRow(row, 'target_variants'),
      transliteration: pickRow(row, 'transliteration', 'pinyin'),
      transliteration_system: pickRow(row, 'transliteration_system'),
      term_type: normalizeTermType(pickRow(row, 'term_type', 'type') || 'OTHER'),
      scope,
      scope_ref: scopeRef,
      status: rawStatus,
      locked: parseBool(pickRow(row, 'locked')) ? '1' : '0',
      confidence: pickRow(row, 'confidence'),
      occurrence_count: pickRow(row, 'occurrence_count'),
      notes: pickRow(row, 'notes'),
      simplified: pickRow(row, 'simplified') || sourceText,
      traditional: pickRow(row, 'traditional'),
      pinyin: pickRow(row, 'pinyin', 'transliteration'),
    };

    if (!TERM_SCOPES.includes(normalized.scope as (typeof TERM_SCOPES)[number])) {
      messages.push(`Invalid scope: ${normalized.scope}`);
    }
    if (!TERM_STATUSES.includes(normalized.status as (typeof TERM_STATUSES)[number])) {
      messages.push(`Invalid status: ${normalized.status}`);
    }
    if (normalized.term_id && !isUuid(normalized.term_id)) {
      messages.push(`Invalid term_id UUID: ${normalized.term_id}`);
    }
    if (normalized.scope === 'PROJECT' && !normalized.scope_ref && !ctx.projectId) {
      messages.push('scope_ref required for PROJECT scope without project context');
    }
    if (!normalized.target_text) {
      messages.push('target_text missing');
    }

    const elevated = (TERM_TABULAR_ELEVATED_STATUSES as readonly string[]).includes(
      normalized.status,
    );
    if (elevated && !(ctx.termImport?.allowElevatedStatus ?? false)) {
      const { status, warnings } = clampImportedStatus(normalized.status, ctx);
      normalized.status = status;
      messages.push(...warnings);
    }
    if (normalized.locked === '1' && !(ctx.termImport?.allowElevatedStatus ?? false)) {
      normalized.locked = '0';
      messages.push('locked cleared (elevated import not allowed)');
    }

    const existing = findExistingTerm(normalized, ctx);
    if (existing) {
      messages.push(`Duplicate of term ${existing.id}`);
    }

    const status =
      messages.some((m) => m.includes('required') || m.startsWith('Invalid'))
        ? 'error'
        : messages.length > 0
          ? 'warning'
          : 'valid';
    return { status, messages, normalized };
  },

  naturalKey(row, ctx) {
    const source = pickRow(row, 'source_text', 'simplified', 'chinese');
    const srcLang = normalizeLanguageCode(
      pickRow(row, 'source_language') || ctx.meta?.source_language || DEFAULT_SOURCE_LANGUAGE,
    );
    const tgtLang = normalizeLanguageCode(
      pickRow(row, 'target_language') || ctx.meta?.target_language || DEFAULT_TARGET_LANGUAGE,
    );
    const scope = (pickRow(row, 'scope') || 'GLOBAL').toUpperCase();
    const scopeRef = resolveScopeRef(scope, pickRow(row, 'scope_ref'), ctx.projectId) ?? '';
    return `${srcLang}|${tgtLang}|${source}|${scope}|${scopeRef}`;
  },

  exportRows(ctx) {
    const db = ctx.db;
    return listTermsForExport(ctx).map((term) => exportTermRow(db, term));
  },

  commitRow(row, ctx) {
    const db = ctx.db;
    const strategy = ctx.termImport?.duplicateStrategy ?? 'SKIP';
    const existing = findExistingTerm(row, ctx);

    if (existing?.locked === 1 && row.locked !== '1') {
      return { action: 'skip' as const };
    }

    if (existing) {
      if (strategy === 'SKIP') return { action: 'skip' as const };

      const prior: Record<string, unknown> = { ...existing };

      if (strategy === 'REPLACE_TARGET') {
        const updated = db.terms.update(existing.id, {
          preferred_translation: row.target_text,
        });
        if (!updated) return { action: 'skip' as const };
        return {
          action: 'update' as const,
          undo: { entityType: 'term', entityId: existing.id, action: 'update', prior },
        };
      }

      if (strategy === 'CREATE_CANDIDATE') {
        const created = db.terms.create({
          source_text: row.source_text,
          source_simplified: row.simplified || row.source_text,
          source_traditional: row.traditional || null,
          pinyin: row.pinyin || null,
          source_language: row.source_language,
          target_language: row.target_language,
          source_variants: parsePipeList(row.source_variants),
          target_variants: parsePipeList(row.target_variants),
          transliteration: row.transliteration || null,
          transliteration_system: row.transliteration_system || null,
          term_type: normalizeTermType(row.term_type),
          scope: (row.scope || 'PROJECT') as TermScope,
          scope_ref: resolveScopeRef(row.scope, row.scope_ref, ctx.projectId),
          status: 'CANDIDATE',
          notes: row.notes || null,
          locked: false,
          preferred_translation: row.target_text,
          confidence: row.confidence ? Number(row.confidence) : null,
        });
        return {
          action: 'insert' as const,
          undo: {
            entityType: 'term',
            entityId: created.id,
            action: 'insert',
            prior: null,
          },
        };
      }

      // MERGE (default for duplicates when not skip)
      const { status } = clampImportedStatus(row.status, ctx);
      const updated = db.terms.update(existing.id, {
        source_text: row.source_text,
        source_simplified: row.simplified || row.source_text,
        source_traditional: row.traditional || null,
        pinyin: row.pinyin || null,
        source_language: row.source_language,
        target_language: row.target_language,
        source_variants: parsePipeList(row.source_variants),
        target_variants: parsePipeList(row.target_variants),
        transliteration: row.transliteration || null,
        transliteration_system: row.transliteration_system || null,
        term_type: normalizeTermType(row.term_type),
        scope: row.scope as TermScope,
        scope_ref: resolveScopeRef(row.scope, row.scope_ref, ctx.projectId),
        status,
        notes: row.notes || null,
        locked: row.locked === '1',
        preferred_translation: row.target_text,
        confidence: row.confidence ? Number(row.confidence) : undefined,
      });
      if (!updated) return { action: 'skip' as const };
      return {
        action: 'update' as const,
        undo: { entityType: 'term', entityId: existing.id, action: 'update', prior },
      };
    }

    const scope = (row.scope || (ctx.projectId ? 'PROJECT' : 'GLOBAL')) as TermScope;
    const { status } = clampImportedStatus(
      row.status ||
        ctx.termImport?.defaultImportStatus ||
        (ctx.projectId ? 'PROJECT_VERIFIED' : 'CANDIDATE'),
      ctx,
    );

    const created = db.terms.create({
      source_text: row.source_text,
      source_simplified: row.simplified || row.source_text,
      source_traditional: row.traditional || null,
      pinyin: row.pinyin || null,
      source_language: row.source_language,
      target_language: row.target_language,
      source_variants: parsePipeList(row.source_variants),
      target_variants: parsePipeList(row.target_variants),
      transliteration: row.transliteration || null,
      transliteration_system: row.transliteration_system || null,
      term_type: normalizeTermType(row.term_type),
      scope,
      scope_ref: resolveScopeRef(scope, row.scope_ref, ctx.projectId),
      status,
      notes: row.notes || null,
      locked: row.locked === '1',
      preferred_translation: row.target_text,
      confidence: row.confidence ? Number(row.confidence) : null,
    });

    const undo: TabularUndoEntry = {
      entityType: 'term',
      entityId: created.id,
      action: 'insert',
      prior: null,
    };
    return { action: 'insert' as const, undo };
  },
};