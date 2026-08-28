import { z } from 'zod';
import {
  SOURCE_DETECTION_METHODS,
  SOURCE_LANGUAGE_MODES,
} from '../constants/source-language';
import { LanguageCodeSchema } from './language-profile';

export const AiLanguageDetectOutputSchema = z.object({
  language_code: z.string().min(2).max(32),
  confidence: z.number().min(0).max(1),
  language_name: z.string().optional(),
  script: z.string().optional(),
  mixed_language: z.boolean().default(false),
  secondary_languages: z.array(z.string()).default([]),
});

export type AiLanguageDetectOutput = z.infer<typeof AiLanguageDetectOutputSchema>;

export const SourceLanguageDetectionSchema = z.object({
  detectedLanguage: LanguageCodeSchema,
  confidence: z.number().min(0).max(1),
  method: z.enum(SOURCE_DETECTION_METHODS),
  internationalName: z.string(),
  nativeName: z.string(),
  displayNameVi: z.string(),
  displayNameNative: z.string(),
  hintCode: z.string().nullable(),
  hintMismatch: z.boolean(),
  mixedLanguage: z.boolean(),
  secondaryLanguages: z.array(z.string()),
  needsUserConfirm: z.boolean(),
  profileMissing: z.boolean().optional(),
});

export type SourceLanguageDetection = z.infer<typeof SourceLanguageDetectionSchema>;

export const ProjectSourceLanguageMetaSchema = z.object({
  sourceLanguageMode: z.enum(SOURCE_LANGUAGE_MODES),
  sourceLanguageHint: z.string().nullable(),
  sourceLanguageConfidence: z.number().min(0).max(1).nullable(),
  sourceLanguageDetectionMethod: z.enum(SOURCE_DETECTION_METHODS).nullable(),
  sourceLanguageDetectionCheckedAt: z.string().nullable(),
  hintMismatch: z.boolean().optional(),
});

export const SourceLanguageRedetectRequestSchema = z.object({
  projectId: z.string().uuid(),
  apply: z.boolean().default(false),
});

export const SourceLanguageRedetectResponseSchema = z.object({
  detection: SourceLanguageDetectionSchema,
  currentLanguage: z.string(),
  changed: z.boolean(),
  hasTranslations: z.boolean(),
  applied: z.boolean(),
  requiresConfirmation: z.boolean(),
});

export type SourceLanguageRedetectResponse = z.infer<
  typeof SourceLanguageRedetectResponseSchema
>;
