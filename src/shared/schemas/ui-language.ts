import { z } from 'zod';

export const UiLanguagePreferenceSchema = z.enum(['system', 'vi', 'en']);

export type UiLanguagePreferenceDto = z.infer<typeof UiLanguagePreferenceSchema>;

export const UiLanguageStatusSchema = z.object({
  preference: UiLanguagePreferenceSchema,
  /** Resolved locale for rendering (system → vi|en). */
  locale: z.enum(['vi', 'en']),
  chosen: z.boolean(),
  /** Fresh install must show language chooser before login/workspace. */
  needsFirstRunChooser: z.boolean(),
});

export type UiLanguageStatus = z.infer<typeof UiLanguageStatusSchema>;

export const UiLanguageSetRequestSchema = z.object({
  preference: UiLanguagePreferenceSchema,
});

export const UiLanguageCompleteFirstRunRequestSchema = z.object({
  preference: z.enum(['vi', 'en']),
});

export const UiLanguageSetResponseSchema = UiLanguageStatusSchema;
