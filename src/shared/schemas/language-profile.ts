import { z } from 'zod';
import {
  LANGUAGE_AUTO,
  LANGUAGE_SCRIPTS,
  PUNCTUATION_PROFILES,
  QUOTE_STYLES,
  SEGMENTATION_STRATEGIES,
  TEXT_DIRECTIONS,
  normalizeLanguageCode,
} from '../constants/language-profile';

export const LanguageProfileDtoSchema = z.object({
  code: z.string().min(2).max(32),
  displayNameVi: z.string(),
  displayNameNative: z.string(),
  script: z.enum(LANGUAGE_SCRIPTS),
  direction: z.enum(TEXT_DIRECTIONS),
  segmentationStrategy: z.enum(SEGMENTATION_STRATEGIES),
  quoteStyle: z.enum(QUOTE_STYLES),
  punctuationProfile: z.enum(PUNCTUATION_PROFILES),
  supportsTransliteration: z.boolean(),
  defaultTransliterationSystem: z.string().optional(),
});

export type LanguageProfileDto = z.infer<typeof LanguageProfileDtoSchema>;

/** Persisted project language — AUTO not allowed. */
export const LanguageCodeSchema = z
  .string()
  .min(2)
  .max(32)
  .transform((v) => normalizeLanguageCode(v))
  .refine((v) => v.toUpperCase() !== LANGUAGE_AUTO, {
    message: 'AUTO cannot be persisted; resolve detection first',
  });

/** Create/input: AUTO or language code. */
export const SourceLanguageInputSchema = z
  .string()
  .min(2)
  .max(32)
  .transform((v) => {
    if (v.trim().toUpperCase() === LANGUAGE_AUTO) return LANGUAGE_AUTO;
    return normalizeLanguageCode(v);
  });

export const LanguageListResponseSchema = z.object({
  languages: z.array(LanguageProfileDtoSchema),
});

export const LanguageDetectRequestSchema = z.object({
  sampleText: z.string().min(1).max(50_000),
  /** Optional hint when user already picked a candidate. */
  hintCode: z.string().max(32).optional(),
});

export const LanguageDetectResponseSchema = z.object({
  code: LanguageCodeSchema,
  displayNameVi: z.string(),
  displayNameNative: z.string(),
  confidence: z.number().min(0).max(1),
  method: z.enum(['heuristic', 'ai', 'hint', 'fallback']),
  /** True when confidence is low enough that UI must let user confirm/edit. */
  needsUserConfirm: z.boolean(),
});

export type LanguageDetectRequest = z.infer<typeof LanguageDetectRequestSchema>;
export type LanguageDetectResponse = z.infer<typeof LanguageDetectResponseSchema>;
