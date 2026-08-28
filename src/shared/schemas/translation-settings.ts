import { z } from 'zod';

export const DefaultTargetLanguageSettingsSchema = z.object({
  defaultTargetLanguage: z.string(),
  /** Stored value was not in the language catalog. */
  invalidPersisted: z.boolean().optional(),
  /** Whether a value was ever persisted (vs migration fallback). */
  hadPersistedValue: z.boolean().optional(),
  /** Selected language is EXPERIMENTAL tier. */
  experimental: z.boolean().optional(),
});

export type DefaultTargetLanguageSettings = z.infer<
  typeof DefaultTargetLanguageSettingsSchema
>;

export const SetDefaultTargetLanguageRequestSchema = z.object({
  defaultTargetLanguage: z.string().min(1),
});

export const SetDefaultTargetLanguageResponseSchema =
  DefaultTargetLanguageSettingsSchema;
