import type { TermRow, TermTranslationRow } from '../db/repositories/term-repository';
import type { TermCandidateRow } from '../db/repositories/term-candidate-repository';
import { normalizeTermType } from '@shared/constants/term';
import type { TermDto, TermCandidateDto } from '@shared/schemas/term';
import { termSourceText } from '../terms/term-language-adapter';
import { parseJsonStringArray } from '../terms/term-variant-json';

export function toTermDto(
  row: TermRow,
  translations: TermTranslationRow[],
): TermDto {
  const primary = translations.find((t) => t.is_primary === 1)?.target_text ?? null;
  const alternatives = translations
    .filter((t) => t.is_primary !== 1)
    .map((t) => t.target_text);
  const sourceText = termSourceText(row);

  return {
    id: row.id,
    sourceText,
    targetText: primary,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    sourceVariants: parseJsonStringArray(row.source_variants),
    targetVariants: parseJsonStringArray(row.target_variants),
    transliteration: row.transliteration ?? row.pinyin,
    transliterationSystem:
      row.transliteration_system ?? (row.pinyin ? 'pinyin' : null),
    simplified: row.source_simplified || sourceText,
    traditional: row.source_traditional,
    pinyin: row.pinyin ?? row.transliteration,
    preferredTranslation: primary,
    alternativeTranslations: alternatives,
    type: normalizeTermType(row.term_type),
    meaning: row.meaning,
    scope: row.scope as TermDto['scope'],
    scopeRef: row.scope_ref,
    genre: row.genre,
    confidence: row.confidence,
    status: row.status as TermDto['status'],
    notes: row.notes,
    occurrences: row.occurrence_count,
    projectCount: row.project_count,
    novelCount: row.novel_count,
    locked: row.locked === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTermCandidateDto(row: TermCandidateRow): TermCandidateDto {
  let heuristicTags: string[] = [];
  if (row.heuristic_tags) {
    try {
      heuristicTags = JSON.parse(row.heuristic_tags) as string[];
    } catch {
      heuristicTags = [];
    }
  }
  return {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    sourceText: row.source_text,
    suggestedType: row.suggested_type ? normalizeTermType(row.suggested_type) : null,
    suggestedTranslation: row.suggested_translation,
    confidence: row.confidence,
    frequency: row.frequency,
    heuristicTags,
    contextSnippet: row.context_snippet,
    status: row.status as TermCandidateDto['status'],
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
