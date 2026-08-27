import { z } from 'zod';

/**
 * Locator definitions only — no executable code.
 * Strings only (no RegExp literals) so overrides stay data-safe JSON.
 */
export const SelectorStrategyOverrideSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('testId'), testId: z.string().min(1).max(200) }),
  z.object({
    kind: z.literal('role'),
    role: z.string().min(1).max(64),
    name: z.string().min(1).max(200).optional(),
  }),
  z.object({ kind: z.literal('label'), label: z.string().min(1).max(200) }),
  z.object({
    kind: z.literal('placeholder'),
    placeholder: z.string().min(1).max(200),
  }),
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(200) }),
  z.object({
    kind: z.literal('css'),
    css: z
      .string()
      .min(1)
      .max(500)
      .refine((v) => !/[;`<>]|javascript:/i.test(v), {
        message: 'css locator must be a plain selector',
      })
      .refine(
        (v) => {
          const t = v.trim().toLowerCase();
          return !['h1', 'button', '[contenteditable=true]', '[contenteditable="true"]'].includes(
            t,
          );
        },
        {
          message:
            'css override cannot be a generic sole selector (h1|button|[contenteditable=true])',
        },
      ),
  }),
]);

export type SelectorStrategyOverride = z.infer<typeof SelectorStrategyOverrideSchema>;

export const SelectorOverrideModeSchema = z.enum(['prepend', 'append', 'replace']);
export type SelectorOverrideMode = z.infer<typeof SelectorOverrideModeSchema>;

export const SelectorKeyOverrideSchema = z.object({
  strategies: z.array(SelectorStrategyOverrideSchema).min(1).max(20),
  mode: SelectorOverrideModeSchema.optional().default('prepend'),
  description: z.string().max(500).optional(),
  /** Optional surface hint for operators; validated as free string. */
  surface: z
    .enum(['GEMINI_CHAT', 'GEMINI_NOTEBOOK', 'NOTEBOOKLM', 'GOOGLE_LOGIN', 'UNKNOWN'])
    .optional(),
});

export const ProviderSelectorOverridesSchema = z.object({
  selectors: z.record(z.string().min(1).max(64), SelectorKeyOverrideSchema),
});

export const SelectorOverrideFileSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime().optional(),
  providers: z.record(z.string().min(1).max(64), ProviderSelectorOverridesSchema),
});

export type SelectorOverrideFile = z.infer<typeof SelectorOverrideFileSchema>;

export const LoadSelectorOverridesRequestSchema = z.object({
  filePath: z.string().min(1).optional(),
});

export const LoadSelectorOverridesResponseSchema = z.object({
  ok: z.boolean(),
  filePath: z.string(),
  overrideCount: z.number().int().nonnegative(),
  errors: z.array(z.string()),
});

export const SaveSelectorOverridesRequestSchema = z.object({
  file: SelectorOverrideFileSchema,
});

export const SaveSelectorOverridesResponseSchema = z.object({
  ok: z.boolean(),
  filePath: z.string(),
});

export const GetSelectorOverridesResponseSchema = z.object({
  filePath: z.string(),
  file: SelectorOverrideFileSchema,
  exists: z.boolean(),
});
