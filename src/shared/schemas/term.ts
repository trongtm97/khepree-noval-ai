import { z } from 'zod';
import {
  CANDIDATE_STATUSES,
  REVIEW_ACTIONS,
  TERM_SCOPES,
  TERM_STATUSES,
  TERM_TYPES,
} from '../constants/term';

export const TermDtoSchema = z.object({
  id: z.string().uuid(),
  sourceText: z.string(),
  targetText: z.string().nullable(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  sourceVariants: z.array(z.string()),
  targetVariants: z.array(z.string()),
  transliteration: z.string().nullable(),
  transliterationSystem: z.string().nullable(),
  /** Legacy Chinese alias of sourceText. */
  simplified: z.string(),
  /** Legacy Chinese traditional form. */
  traditional: z.string().nullable(),
  /** Legacy Chinese pinyin (= transliteration when system=pinyin). */
  pinyin: z.string().nullable(),
  preferredTranslation: z.string().nullable(),
  alternativeTranslations: z.array(z.string()),
  type: z.enum(TERM_TYPES),
  meaning: z.string().nullable(),
  scope: z.enum(TERM_SCOPES),
  scopeRef: z.string().nullable(),
  genre: z.string().nullable(),
  confidence: z.number().nullable(),
  status: z.enum(TERM_STATUSES),
  notes: z.string().nullable(),
  occurrences: z.number().int().nonnegative(),
  projectCount: z.number().int().nonnegative(),
  novelCount: z.number().int().nonnegative(),
  locked: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TermDto = z.infer<typeof TermDtoSchema>;

export const TermCandidateDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  chapterId: z.string().uuid().nullable(),
  sourceText: z.string(),
  suggestedType: z.enum(TERM_TYPES).nullable(),
  suggestedTranslation: z.string().nullable(),
  confidence: z.number().nullable(),
  frequency: z.number().int().positive(),
  heuristicTags: z.array(z.string()),
  contextSnippet: z.string().nullable(),
  status: z.enum(CANDIDATE_STATUSES),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TermCandidateDto = z.infer<typeof TermCandidateDtoSchema>;

export const TermSearchRequestSchema = z.object({
  chinese: z.string().optional(),
  vietnamese: z.string().optional(),
  sourceText: z.string().optional(),
  targetText: z.string().optional(),
  pinyin: z.string().optional(),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
  type: z.enum(TERM_TYPES).optional(),
  scope: z.enum(TERM_SCOPES).optional(),
  scopeRef: z.string().optional(),
  status: z.enum(TERM_STATUSES).optional(),
  genre: z.string().optional(),
  projectId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const TermListResponseSchema = z.object({
  terms: z.array(TermDtoSchema),
});

export const TermGetRequestSchema = z.object({
  termId: z.string().uuid(),
});

export const TermGetResponseSchema = z.object({
  term: TermDtoSchema,
});

export const TermUpsertRequestSchema = z.object({
  id: z.string().uuid().optional(),
  sourceText: z.string().min(1).max(200),
  targetText: z.string().max(500).optional(),
  sourceLanguage: z.string().max(32).optional(),
  targetLanguage: z.string().max(32).optional(),
  sourceVariants: z.array(z.string().max(200)).optional(),
  targetVariants: z.array(z.string().max(500)).optional(),
  transliteration: z.string().max(200).nullable().optional(),
  transliterationSystem: z.string().max(64).nullable().optional(),
  simplified: z.string().min(1).max(200).optional(),
  traditional: z.string().max(200).nullable().optional(),
  pinyin: z.string().max(200).nullable().optional(),
  preferredTranslation: z.string().max(500).optional(),
  alternativeTranslations: z.array(z.string().max(500)).optional(),
  type: z.enum(TERM_TYPES).optional(),
  meaning: z.string().max(2000).nullable().optional(),
  scope: z.enum(TERM_SCOPES),
  scopeRef: z.string().nullable().optional(),
  genre: z.string().max(200).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  status: z.enum(TERM_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
  locked: z.boolean().optional(),
});

export const TermReviewActionRequestSchema = z.object({
  action: z.enum(REVIEW_ACTIONS),
  termIds: z.array(z.string().uuid()).min(1),
  /** For edit */
  patch: TermUpsertRequestSchema.partial().optional(),
  /** For merge */
  mergeIntoTermId: z.string().uuid().optional(),
  /** For promote */
  targetScope: z.enum(TERM_SCOPES).optional(),
  scopeRef: z.string().nullable().optional(),
});

export const TermBulkResponseSchema = z.object({
  terms: z.array(TermDtoSchema),
  affected: z.number().int().nonnegative(),
});

export const TermCandidateListRequestSchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const TermCandidateListResponseSchema = z.object({
  candidates: z.array(TermCandidateDtoSchema),
});

export const TermMatchChapterRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

export const TermMatchChapterResponseSchema = z.object({
  matches: z.array(
    z.object({
      sourceText: z.string(),
      termId: z.string().uuid(),
      scope: z.enum(TERM_SCOPES),
      effectivePriority: z.number(),
      startIndex: z.number().int(),
      endIndex: z.number().int(),
      contextSnippet: z.string(),
      preferredTranslation: z.string().nullable(),
    }),
  ),
});

export const TermExtractCandidatesRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

export const TermImportRequestSchema = z.object({
  format: z.enum(['csv', 'json']),
  content: z.string().min(1),
  scope: z.enum(TERM_SCOPES).default('GLOBAL'),
  scopeRef: z.string().nullable().optional(),
});

export const TermExportRequestSchema = z.object({
  format: z.enum(['csv', 'json']),
  filters: TermSearchRequestSchema.optional(),
});

export const TermExportResponseSchema = z.object({
  format: z.enum(['csv', 'json']),
  content: z.string(),
  count: z.number().int().nonnegative(),
});

export const TermCandidateReviewRequestSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1),
  action: z.enum(['accept', 'reject']),
  patch: TermUpsertRequestSchema.partial().optional(),
});
