import { z } from 'zod';
import {
  MAX_PACK_CHAPTERS,
  MIN_PACK_CHAPTERS,
  TRANSLATION_PACK_OPERATIONS,
  TRANSLATION_STYLES,
} from '../constants/translation-pack';

export const TranslationPackSectionSchema = z.object({
  taskHeader: z.string(),
  criticalRules: z.string(),
  hotMemoryDelta: z.string(),
  activeProjectTerms: z.string(),
  sourceParagraphs: z.string(),
  outputProtocol: z.string(),
});

export type TranslationPackSections = z.infer<typeof TranslationPackSectionSchema>;

export const TranslationPackSizeSchema = z.object({
  sourceChars: z.number().int().nonnegative(),
  contextChars: z.number().int().nonnegative(),
  totalChars: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  activeTermCount: z.number().int().nonnegative(),
  activeCharacterCount: z.number().int().nonnegative(),
  relationshipCount: z.number().int().nonnegative(),
  recentMemoryCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  chapterCount: z.number().int().positive(),
});

export type TranslationPackSize = z.infer<typeof TranslationPackSizeSchema>;

export const TranslationPackOperationSchema = z.enum(TRANSLATION_PACK_OPERATIONS);

export const TranslationPackDtoSchema = z.object({
  projectId: z.string().uuid(),
  chapterIds: z.array(z.string().uuid()).min(MIN_PACK_CHAPTERS).max(MAX_PACK_CHAPTERS),
  chapterNumbers: z.array(z.number().int().nonnegative()),
  style: z.enum(TRANSLATION_STYLES),
  /** Assembled final prompt sent to providers (= baseContext + operationPrompt). */
  prompt: z.string(),
  /**
   * Provider-adaptable context (Notebook framing or FAT local memory).
   * adaptPackForProvider may replace this — never the operationPrompt.
   */
  baseContext: z.string(),
  /**
   * Immutable operation body for the request.
   * REPAIR / CONTINUATION must survive WebAPI FAT rebuild.
   */
  operationPrompt: z.string(),
  operationType: TranslationPackOperationSchema,
  sections: TranslationPackSectionSchema,
  size: TranslationPackSizeSchema,
  promptHash: z.string(),
  contextFingerprint: z
    .object({
      contextVersion: z.number().int().nonnegative(),
      contextHash: z.string(),
      termCount: z.number().int().nonnegative(),
      characterCount: z.number().int().nonnegative(),
      relationshipCount: z.number().int().nonnegative(),
      memoryCount: z.number().int().nonnegative(),
      estimatedTokens: z.number().int().nonnegative(),
      engineVersion: z.number().int().positive(),
    })
    .optional(),
});

export type TranslationPackDto = z.infer<typeof TranslationPackDtoSchema>;

export const BuildTranslationPackRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterIds: z
    .array(z.string().uuid())
    .min(MIN_PACK_CHAPTERS)
    .max(MAX_PACK_CHAPTERS),
  style: z.enum(TRANSLATION_STYLES).optional(),
  tokenBudget: z.number().int().positive().optional(),
  recentWindow: z.number().int().positive().optional(),
  extraRules: z.array(z.string().min(1)).max(20).optional(),
});

export type BuildTranslationPackRequest = z.infer<
  typeof BuildTranslationPackRequestSchema
>;

export const BuildTranslationPackResponseSchema = z.object({
  pack: TranslationPackDtoSchema,
});

export const ListChaptersRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const ChapterSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  chapterNumber: z.number().int().positive().nullable(),
  sequenceOrder: z.number().int().nonnegative(),
  displayTitle: z.string().nullable().optional(),
  chapterType: z.string().optional(),
  title: z.string().nullable(),
  characterCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  status: z.string(),
  sourceStatus: z.string().optional(),
});

export type ChapterSummaryDto = z.infer<typeof ChapterSummaryDtoSchema>;

export const ListChaptersResponseSchema = z.object({
  chapters: z.array(ChapterSummaryDtoSchema),
});
