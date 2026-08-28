import { z } from 'zod';
import {
  AI_SUPPORT_TIERS,
  LANGUAGE_AUTO,
  NOVELTRANS_VERIFICATION_LEVELS,
  PROVIDER_SUPPORT_LEVELS,
  PUNCTUATION_PROFILES,
  QUOTE_STYLES,
  REGION_GROUPS,
  SEGMENTATION_STRATEGIES,
  TEXT_DIRECTIONS,
  normalizeLanguageCode,
} from '../constants/language-profile';

export const LanguageProfileDtoSchema = z.object({
  code: z.string().min(2).max(32),
  internationalName: z.string().min(1),
  nativeName: z.string().min(1),
  displayNameVi: z.string(),
  displayNameNative: z.string(),
  script: z.string().min(1).max(16),
  direction: z.enum(TEXT_DIRECTIONS),
  regionGroup: z.enum(REGION_GROUPS),
  providerSupport: z.enum(PROVIDER_SUPPORT_LEVELS),
  novelTransVerification: z.enum(NOVELTRANS_VERIFICATION_LEVELS),
  aiSupportTier: z.enum(AI_SUPPORT_TIERS),
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
  internationalName: z.string(),
  nativeName: z.string(),
  displayNameVi: z.string(),
  displayNameNative: z.string(),
  confidence: z.number().min(0).max(1),
  method: z.enum(['heuristic', 'ai', 'hint', 'fallback', 'hybrid']),
  /** True when confidence is low enough that UI must let user confirm/edit. */
  needsUserConfirm: z.boolean(),
  hintCode: z.string().nullable().optional(),
  hintMismatch: z.boolean().optional(),
  mixedLanguage: z.boolean().optional(),
  secondaryLanguages: z.array(z.string()).optional(),
});

export type LanguageDetectRequest = z.infer<typeof LanguageDetectRequestSchema>;
export type LanguageDetectResponse = z.infer<typeof LanguageDetectResponseSchema>;
