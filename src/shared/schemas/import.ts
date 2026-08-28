import { z } from 'zod';
import {
  DEFAULT_TARGET_LANGUAGE,
  LANGUAGE_AUTO,
} from '../constants/language-profile';
import { LanguageCodeSchema } from './language-profile';

export const ProjectDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  genre: z.string().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** @deprecated Prefer sourceChapterCount — kept as alias for older UI. */
  chapterCount: z.number().int().nonnegative().optional(),
  sourceChapterCount: z.number().int().nonnegative().optional(),
  translatedChapterCount: z.number().int().nonnegative().optional(),
  reviewedChapterCount: z.number().int().nonnegative().optional(),
  queuedChapterCount: z.number().int().nonnegative().optional(),
  errorChapterCount: z.number().int().nonnegative().optional(),
  /** Next chapter_number to translate (null if none / complete). */
  nextUntranslatedChapter: z.number().int().positive().nullable().optional(),
  activeEditionId: z.string().uuid().nullable().optional(),
  sourceLanguageMode: z.enum(['AUTO', 'HINTED']).optional(),
  sourceLanguageHint: z.string().nullable().optional(),
  sourceLanguageConfidence: z.number().min(0).max(1).nullable().optional(),
  sourceLanguageDetectionMethod: z
    .enum(['LOCAL', 'AI', 'HYBRID', 'FALLBACK'])
    .nullable()
    .optional(),
  sourceLanguageDetectionCheckedAt: z.string().nullable().optional(),
  hintMismatch: z.boolean().optional(),
  health: z
    .object({
      source: z.enum(['ok', 'warn', 'missing']),
      google: z.enum(['ok', 'warn', 'missing']),
      notebook: z.enum(['ok', 'warn', 'missing']),
      memoryVersion: z.number().int().nonnegative().nullable(),
      memoryVerified: z.boolean(),
    })
    .optional(),
});

export type ProjectDto = z.infer<typeof ProjectDtoSchema>;

export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectDtoSchema),
});

export const ProjectCreateRequestSchema = z.object({
  title: z.string().min(1).max(500),
  genre: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  /**
   * User hint only — never used as translation source of truth.
   * AUTO or omitted = no hint.
   */
  sourceLanguageHint: z.string().max(32).nullable().optional(),
  sourceLanguageMode: z.enum(['AUTO', 'HINTED']).default('AUTO'),
  targetLanguage: LanguageCodeSchema.default(DEFAULT_TARGET_LANGUAGE),
  /** Optional sample for AUTO detection when creating without folder yet. */
  sampleText: z.string().max(50_000).optional(),
});

export const ProjectCreateResponseSchema = z.object({
  project: ProjectDtoSchema,
  /** Present when detection ran at create/import. */
  sourceDetection: z
    .object({
      detectedLanguage: z.string(),
      code: z.string().optional(),
      displayNameVi: z.string(),
      displayNameNative: z.string(),
      nativeName: z.string().optional(),
      internationalName: z.string().optional(),
      confidence: z.number(),
      method: z.enum(['LOCAL', 'AI', 'HYBRID', 'FALLBACK', 'heuristic', 'ai', 'hint', 'fallback', 'hybrid']),
      hintMismatch: z.boolean().optional(),
      hintCode: z.string().nullable().optional(),
      needsUserConfirm: z.boolean(),
    })
    .nullable()
    .optional(),
});

export const ProjectUpdateLanguagesRequestSchema = z.object({
  projectId: z.string().uuid(),
  sourceLanguage: LanguageCodeSchema,
  targetLanguage: LanguageCodeSchema,
}).refine((v) => v.sourceLanguage !== v.targetLanguage, {
  message: 'sourceLanguage and targetLanguage must differ',
});

export const ProjectUpdateLanguagesResponseSchema = z.object({
  project: ProjectDtoSchema,
});

/** Re-export for callers that need AUTO sentinel. */
export { LANGUAGE_AUTO };

export const ProjectIdRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const ProjectDeleteResponseSchema = z.object({
  ok: z.literal(true),
});

export const ImportPreviewChapterSchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string(),
  characterCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  confidence: z.number(),
  isDuplicateTitle: z.boolean(),
  isDuplicateHash: z.boolean(),
  sourceHash: z.string(),
  previewText: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
});

export const ImportPreviewDtoSchema = z.object({
  previewId: z.string().uuid(),
  fileName: z.string(),
  format: z.enum(['txt', 'epub', 'docx']),
  encoding: z.string().optional(),
  encodingConfidence: z.number().optional(),
  overallConfidence: z.number(),
  warnings: z.array(z.string()),
  sourceHash: z.string(),
  chapterCount: z.number().int().nonnegative(),
  chapters: z.array(ImportPreviewChapterSchema),
});

export type ImportPreviewDto = z.infer<typeof ImportPreviewDtoSchema>;

export const ImportSelectFileResponseSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().nullable(),
});

export const ImportPreviewRequestSchema = z.object({
  filePath: z.string().min(1),
});

export const ImportPreviewResponseSchema = z.object({
  preview: ImportPreviewDtoSchema,
});

export const ImportUpdatePreviewRequestSchema = z.object({
  previewId: z.string().uuid(),
  redetect: z.boolean().optional(),
  manualSplits: z
    .array(
      z.object({
        offset: z.number().int().nonnegative(),
        title: z.string().min(1).max(500).optional(),
      }),
    )
    .optional(),
  chapterPatches: z
    .array(
      z.object({
        chapterNumber: z.number().int().positive(),
        title: z.string().min(1).max(500).optional(),
        include: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const ImportCommitRequestSchema = z.object({
  previewId: z.string().uuid(),
  projectTitle: z.string().min(1).max(500),
  projectId: z.string().uuid().optional(),
});

export const ImportCommitResponseSchema = z.object({
  project: ProjectDtoSchema,
  chapterCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
});

export const ImportDiscardRequestSchema = z.object({
  previewId: z.string().uuid(),
});

export const ImportDiscardResponseSchema = z.object({
  ok: z.literal(true),
});
