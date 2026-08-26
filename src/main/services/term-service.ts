import type { ReviewAction, TermScope, TermStatus } from '@shared/constants/term';
import type { TermImportDuplicateStrategy } from '@shared/constants/portability';
import { normalizeTermType } from '@shared/constants/term';
import { getDatabase, withTransaction } from '../db/connection';
import type { TermRow } from '../db/repositories/term-repository';
import type { TermSearchFilters } from '../db/repositories/term-repository';
import {
  buildTermMatchIndex,
  matchKnownTermsInText,
  type TermMatchContext,
} from '../terms/term-matcher';
import {
  extractTermCandidates,
  knownSourceSet,
} from '../terms/candidate-extractor';
import { toTermDto, toTermCandidateDto } from './term-dto';
import type { TermDto, TermCandidateDto } from '@shared/schemas/term';

export class TermService {
  search(filters: TermSearchFilters): TermDto[] {
    const db = getDatabase();
    const rows = db.terms.search(filters);
    return rows.map((row) => this.toDto(row));
  }

  listReviewQueue(limit = 100): TermDto[] {
    return getDatabase()
      .terms.listReviewQueue(limit)
      .map((row) => this.toDto(row));
  }

  get(termId: string): TermDto | null {
    const row = getDatabase().terms.getById(termId);
    return row ? this.toDto(row) : null;
  }

  upsert(input: {
    id?: string;
    sourceText: string;
    simplified?: string;
    traditional?: string | null;
    pinyin?: string | null;
    preferredTranslation?: string;
    alternativeTranslations?: string[];
    type?: string;
    meaning?: string | null;
    scope: TermScope;
    scopeRef?: string | null;
    genre?: string | null;
    confidence?: number | null;
    status?: TermStatus;
    notes?: string | null;
    locked?: boolean;
  }): TermDto {
    const db = getDatabase();
    const simplified = input.simplified ?? input.sourceText;
    if (input.id) {
      const updated = db.terms.update(input.id, {
        source_simplified: simplified,
        source_traditional: input.traditional,
        pinyin: input.pinyin,
        term_type: input.type ? normalizeTermType(input.type) : undefined,
        meaning: input.meaning,
        scope: input.scope,
        scope_ref: input.scopeRef,
        genre: input.genre,
        confidence: input.confidence,
        status: input.status,
        notes: input.notes,
        locked: input.locked,
        preferred_translation: input.preferredTranslation,
        alternative_translations: input.alternativeTranslations,
      });
      if (!updated) throw new Error(`Term not found: ${input.id}`);
      return this.toDto(updated);
    }

    const created = db.terms.create({
      source_simplified: simplified,
      source_traditional: input.traditional,
      pinyin: input.pinyin,
      term_type: input.type ? normalizeTermType(input.type) : undefined,
      meaning: input.meaning,
      scope: input.scope,
      scope_ref: input.scopeRef,
      genre: input.genre,
      confidence: input.confidence,
      status: input.status ?? 'CANDIDATE',
      notes: input.notes,
      locked: input.locked,
      preferred_translation: input.preferredTranslation,
      alternative_translations: input.alternativeTranslations,
    });
    return this.toDto(created);
  }

  reviewAction(input: {
    action: ReviewAction;
    termIds: string[];
    patch?: Partial<Parameters<TermService['upsert']>[0]>;
    mergeIntoTermId?: string;
    targetScope?: TermScope;
    scopeRef?: string | null;
  }): { terms: TermDto[]; affected: number } {
    const db = getDatabase();
    const results: TermDto[] = [];

    return withTransaction(db.getConnection(), () => {
      for (const termId of input.termIds) {
        switch (input.action) {
          case 'accept': {
            const row = db.terms.updateStatus(termId, 'PROJECT_VERIFIED');
            if (row) results.push(this.toDto(row));
            break;
          }
          case 'reject': {
            const row = db.terms.updateStatus(termId, 'REJECTED');
            if (row) results.push(this.toDto(row));
            break;
          }
          case 'edit': {
            if (!input.patch) break;
            const row = db.terms.update(termId, {
              source_simplified: input.patch.sourceText ?? input.patch.simplified,
              source_traditional: input.patch.traditional,
              pinyin: input.patch.pinyin,
              term_type: input.patch.type ? normalizeTermType(input.patch.type) : undefined,
              meaning: input.patch.meaning,
              scope: input.patch.scope,
              scope_ref: input.patch.scopeRef,
              genre: input.patch.genre,
              confidence: input.patch.confidence,
              status: input.patch.status,
              notes: input.patch.notes,
              locked: input.patch.locked,
              preferred_translation: input.patch.preferredTranslation,
              alternative_translations: input.patch.alternativeTranslations,
            });
            if (row) results.push(this.toDto(row));
            break;
          }
          case 'merge': {
            if (!input.mergeIntoTermId) break;
            const row = db.terms.mergeTerms(termId, input.mergeIntoTermId);
            if (row) results.push(this.toDto(row));
            break;
          }
          case 'promote': {
            if (!input.targetScope) break;
            const row = db.terms.promote(termId, input.targetScope, input.scopeRef);
            if (row) {
              results.push(this.toDto(row));
              const projectId =
                input.scopeRef ??
                (row.scope === 'PROJECT' ? row.scope_ref : null) ??
                undefined;
              if (projectId) {
                db.learningEvents.create({
                  project_id: projectId,
                  event_type: 'promotion',
                  payload: {
                    termId: row.id,
                    source: row.source_simplified,
                    status: row.status,
                    scope: row.scope,
                    human: true,
                  },
                });
              }
            }
            break;
          }
          case 'lock': {
            const row = db.terms.lock(termId, true);
            if (row) results.push(this.toDto(row));
            break;
          }
        }
      }
      return { terms: results, affected: results.length };
    });
  }

  matchChapter(projectId: string, chapterId: string) {
    const db = getDatabase();
    const chapter = db.chapters.getById(chapterId);
    if (chapter?.project_id !== projectId) {
      throw new Error('Chapter not found for project');
    }
    const project = db.projects.getById(projectId);
    const text = chapter.source_text ?? '';
    const context: TermMatchContext = {
      projectId,
      genre: project?.genre ?? null,
    };
    const allTerms = db.terms.listForMatching(context);
    const index = buildTermMatchIndex(allTerms);
    const matches = matchKnownTermsInText(text, index, allTerms, context);

    for (const m of matches) {
      db.terms.incrementOccurrence(m.term.id, projectId, {
        chapterId,
        contextSnippet: m.contextSnippet,
      });
    }

    return matches.map((m) => ({
      sourceText: m.sourceText,
      termId: m.term.id,
      scope: m.scope,
      effectivePriority: m.effectivePriority,
      startIndex: m.startIndex,
      endIndex: m.endIndex,
      contextSnippet: m.contextSnippet,
      preferredTranslation: db.terms.getPrimaryTranslation(m.term.id),
    }));
  }

  extractCandidates(projectId: string, chapterId: string): TermCandidateDto[] {
    const db = getDatabase();
    const chapter = db.chapters.getById(chapterId);
    if (chapter?.project_id !== projectId) {
      throw new Error('Chapter not found for project');
    }
    const text = chapter.source_text ?? '';
    const known = knownSourceSet(db.terms.listAllActive());
    const extracted = extractTermCandidates(text, { knownSources: known, minFrequency: 2 });

    const saved: TermCandidateDto[] = [];
    for (const c of extracted) {
      const row = db.termCandidates.upsertCandidate({
        project_id: projectId,
        chapter_id: chapterId,
        source_text: c.sourceText,
        suggested_type: c.suggestedType,
        confidence: c.confidence,
        frequency: c.frequency,
        heuristic_tags: c.heuristicTags,
        context_snippet: c.contextSnippet,
      });
      saved.push(toTermCandidateDto(row));
    }
    return saved;
  }

  listCandidates(projectId?: string, limit = 200): TermCandidateDto[] {
    return getDatabase()
      .termCandidates.listPending(projectId, limit)
      .map(toTermCandidateDto);
  }

  reviewCandidates(input: {
    candidateIds: string[];
    action: 'accept' | 'reject';
    patch?: Partial<Parameters<TermService['upsert']>[0]>;
  }): { terms: TermDto[]; affected: number } {
    const db = getDatabase();
    const terms: TermDto[] = [];

    return withTransaction(db.getConnection(), () => {
      for (const id of input.candidateIds) {
        const candidate = db.termCandidates.getById(id);
        if (!candidate) continue;

        if (input.action === 'reject') {
          db.termCandidates.updateStatus(id, 'REJECTED');
          continue;
        }

        const term = this.upsert({
          sourceText: input.patch?.sourceText ?? candidate.source_text,
          simplified: candidate.source_text,
          type: input.patch?.type ?? candidate.suggested_type ?? 'GENERAL',
          preferredTranslation:
            input.patch?.preferredTranslation ?? candidate.suggested_translation ?? undefined,
          scope: input.patch?.scope ?? 'PROJECT',
          scopeRef: input.patch?.scopeRef ?? candidate.project_id ?? undefined,
          status: 'CANDIDATE',
          confidence: candidate.confidence,
        });
        terms.push(term);
        db.termCandidates.updateStatus(id, 'ACCEPTED');
      }
      return { terms, affected: terms.length };
    });
  }

  importTerms(input: {
    format: 'csv' | 'json';
    content: string;
    scope: TermScope;
    scopeRef?: string | null;
  }): { imported: number; terms: TermDto[] } {
    const records =
      input.format === 'json' ? parseJsonImport(input.content) : parseCsvImport(input.content);
    const terms: TermDto[] = [];
    for (const rec of records) {
      terms.push(
        this.upsert({
          sourceText: rec.sourceText,
          simplified: rec.simplified ?? rec.sourceText,
          traditional: rec.traditional ?? null,
          pinyin: rec.pinyin ?? null,
          preferredTranslation: rec.preferredTranslation,
          alternativeTranslations: rec.alternativeTranslations,
          type: rec.type,
          meaning: rec.meaning ?? null,
          scope: rec.scope ?? input.scope,
          scopeRef: rec.scopeRef ?? input.scopeRef,
          genre: rec.genre ?? null,
          status: 'CANDIDATE',
        }),
      );
    }
    return { imported: terms.length, terms };
  }

  previewImport(input: {
    format: 'csv' | 'json';
    content: string;
    projectId?: string;
  }): {
    rows: {
      rowIndex: number;
      sourceText: string;
      preferredTranslation: string | null;
      scope: string | null;
      duplicateOfTermId: string | null;
      duplicateAction: 'new' | 'duplicate';
    }[];
    duplicateCount: number;
  } {
    const records =
      input.format === 'json' ? parseJsonImport(input.content) : parseCsvImport(input.content);
    const db = getDatabase();
    let duplicateCount = 0;

    const rows = records.map((rec, rowIndex) => {
      const matches = db.terms.search({
        chinese: rec.sourceText,
        projectId: input.projectId,
        limit: 5,
      });
      const duplicate = matches.find((m) => m.source_simplified === rec.sourceText) ?? null;
      if (duplicate) duplicateCount += 1;
      return {
        rowIndex,
        sourceText: rec.sourceText,
        preferredTranslation: rec.preferredTranslation ?? null,
        scope: rec.scope ?? null,
        duplicateOfTermId: duplicate?.id ?? null,
        duplicateAction: duplicate ? ('duplicate' as const) : ('new' as const),
      };
    });

    return { rows, duplicateCount };
  }

  commitImport(input: {
    format: 'csv' | 'json';
    content: string;
    scope: TermScope;
    scopeRef?: string | null;
    duplicateStrategy?: TermImportDuplicateStrategy;
  }): { imported: number; skipped: number; merged: number; terms: TermDto[] } {
    const records =
      input.format === 'json' ? parseJsonImport(input.content) : parseCsvImport(input.content);
    const strategy = input.duplicateStrategy ?? 'skip';
    const db = getDatabase();
    const terms: TermDto[] = [];
    let skipped = 0;
    let merged = 0;

    for (const rec of records) {
      const existing = db.terms
        .search({ chinese: rec.sourceText, limit: 1 })
        .find((m) => m.source_simplified === rec.sourceText);

      if (existing && strategy === 'skip') {
        skipped += 1;
        continue;
      }

      if (existing && strategy === 'merge') {
        const updated = db.terms.update(existing.id, {
          preferred_translation: rec.preferredTranslation ?? undefined,
          meaning: rec.meaning ?? undefined,
          genre: rec.genre ?? undefined,
        });
        if (updated) {
          terms.push(this.toDto(updated));
          merged += 1;
        }
        continue;
      }

      const term = this.upsert({
        id: existing && strategy === 'replace' ? existing.id : undefined,
        sourceText: rec.sourceText,
        simplified: rec.simplified ?? rec.sourceText,
        traditional: rec.traditional ?? null,
        pinyin: rec.pinyin ?? null,
        preferredTranslation: rec.preferredTranslation,
        alternativeTranslations: rec.alternativeTranslations,
        type: rec.type,
        meaning: rec.meaning ?? null,
        scope: rec.scope ?? input.scope,
        scopeRef: rec.scopeRef ?? input.scopeRef,
        genre: rec.genre ?? null,
        status: 'CANDIDATE',
      });
      terms.push(term);
      if (existing && strategy === 'replace') merged += 1;
    }

    return { imported: terms.length, skipped, merged, terms };
  }

  exportTerms(input: {
    format: 'csv' | 'json';
    filters?: TermSearchFilters;
  }): { format: 'csv' | 'json'; content: string; count: number } {
    const terms = this.search(input.filters ?? { limit: 10000 });
    if (input.format === 'json') {
      return {
        format: 'json',
        content: JSON.stringify(terms, null, 2),
        count: terms.length,
      };
    }
    return {
      format: 'csv',
      content: serializeCsv(terms),
      count: terms.length,
    };
  }

  private toDto(row: TermRow): TermDto {
    const translations = getDatabase().terms.listTranslations(row.id);
    return toTermDto(row, translations);
  }
}

interface ImportRecord {
  sourceText: string;
  simplified?: string;
  traditional?: string | null;
  pinyin?: string | null;
  preferredTranslation?: string;
  alternativeTranslations?: string[];
  type?: string;
  meaning?: string | null;
  scope?: TermScope;
  scopeRef?: string | null;
  genre?: string | null;
}

function parseJsonImport(content: string): ImportRecord[] {
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) throw new Error('JSON import must be an array');
  return parsed as ImportRecord[];
}

function parseCsvImport(content: string): ImportRecord[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const records: ImportRecord[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    records.push({
      sourceText: row.sourcetext || row.chinese || row.source || '',
      simplified: row.simplified || undefined,
      traditional: row.traditional || null,
      pinyin: row.pinyin || null,
      preferredTranslation: row.preferredtranslation || row.vietnamese || undefined,
      type: row.type || undefined,
      meaning: row.meaning || null,
      genre: row.genre || null,
    });
  }
  return records.filter((r) => r.sourceText);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function serializeCsv(terms: TermDto[]): string {
  const header =
    'sourceText,simplified,traditional,pinyin,preferredTranslation,type,meaning,scope,genre,status,occurrences';
  const rows = terms.map((t) =>
    [
      csvEscape(t.sourceText),
      csvEscape(t.simplified),
      csvEscape(t.traditional ?? ''),
      csvEscape(t.pinyin ?? ''),
      csvEscape(t.preferredTranslation ?? ''),
      t.type,
      csvEscape(t.meaning ?? ''),
      t.scope,
      csvEscape(t.genre ?? ''),
      t.status,
      String(t.occurrences),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
