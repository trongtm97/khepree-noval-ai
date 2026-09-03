import { z } from 'zod';
import {
  TranslationRecipeConfigSchema,
  TranslationRecipeOverrideSchema,
  type TranslationRecipeConfigDto,
  type TranslationRecipeOverrideDto,
} from '../constants/translation-recipe-defs';
import { TRANSLATION_RECIPE_MODES } from '../constants/translation-recipes';

export { TranslationRecipeConfigSchema, TranslationRecipeOverrideSchema };
export type { TranslationRecipeConfigDto, TranslationRecipeOverrideDto };

/** Keys / path segments that must never appear in imported recipe JSON. */
export const RECIPE_SECRET_KEY_PATTERN =
  /(cookie|token|password|secret|authorization|api[_-]?key|session|credential|profile[_-]?path|user[_-]?data|browser[_-]?profile|refresh[_-]?token|access[_-]?token|private[_-]?key)/i;

export class RecipeImportError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_SCHEMA' | 'SECRET_FIELD' | 'UNSUPPORTED_VERSION',
  ) {
    super(message);
    this.name = 'RecipeImportError';
  }
}

function walkForSecrets(value: unknown, path: string[]): void {
  if (value == null) return;
  if (typeof value === 'string') {
    if (
      path.length > 0 &&
      (/^[A-Za-z]:\\/.test(value) ||
        value.startsWith('/home/') ||
        value.startsWith('/Users/') ||
        /Chrome|Chromium|User Data|browserProfiles/i.test(value))
    ) {
      throw new RecipeImportError(
        `Recipe JSON rejected: path-like value at "${path.join('.')}"`,
        'SECRET_FIELD',
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkForSecrets(item, [...path, String(i)]));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...path, key];
    if (RECIPE_SECRET_KEY_PATTERN.test(key)) {
      throw new RecipeImportError(
        `Recipe JSON rejected: forbidden field "${nextPath.join('.')}"`,
        'SECRET_FIELD',
      );
    }
    walkForSecrets(child, nextPath);
  }
}

export const RecipeExportEnvelopeSchema = z.object({
  kind: z.literal('khepree-translation-recipe'),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().optional(),
  recipe: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    basedOnMode: z.enum(TRANSLATION_RECIPE_MODES).optional(),
    config: TranslationRecipeConfigSchema,
  }),
});

export type RecipeExportEnvelope = z.infer<typeof RecipeExportEnvelopeSchema>;

export function assertSafeRecipePayload(raw: unknown): void {
  walkForSecrets(raw, []);
}

export function parseRecipeImport(raw: unknown): RecipeExportEnvelope {
  assertSafeRecipePayload(raw);
  const parsed = RecipeExportEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RecipeImportError(
      `Recipe JSON rejected: ${parsed.error.issues[0]?.message ?? 'invalid schema'}`,
      'INVALID_SCHEMA',
    );
  }
  if (parsed.data.schemaVersion > 1) {
    throw new RecipeImportError(
      `Unsupported recipe schema version: ${parsed.data.schemaVersion}`,
      'UNSUPPORTED_VERSION',
    );
  }
  return parsed.data;
}

export const RecipeListItemSchema = z.object({
  id: stringUuidOrBuiltin(),
  name: z.string(),
  nameEn: z.string().nullable(),
  nameVi: z.string().nullable(),
  description: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  descriptionVi: z.string().nullable(),
  tradeoffEn: z.string().nullable(),
  tradeoffVi: z.string().nullable(),
  mode: z.enum(TRANSLATION_RECIPE_MODES),
  version: z.string(),
  isBuiltin: z.boolean(),
  isDefault: z.boolean(),
  config: TranslationRecipeConfigSchema,
  clonedFromId: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

function stringUuidOrBuiltin() {
  return z.string().min(1).max(64);
}

export type RecipeListItemDto = z.infer<typeof RecipeListItemSchema>;

export const RecipeResolveResultSchema = z.object({
  recipeId: z.string(),
  mode: z.enum(TRANSLATION_RECIPE_MODES),
  source: z.enum(['builtin', 'user', 'campaign_snapshot', 'project_override']),
  config: TranslationRecipeConfigSchema,
  overrideApplied: z.boolean(),
});

export type RecipeResolveResultDto = z.infer<typeof RecipeResolveResultSchema>;

export const RecipeCreateRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  cloneFromId: z.string().min(1).max(64).optional(),
  config: TranslationRecipeConfigSchema.optional(),
});

export const RecipeUpdateRequestSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  config: TranslationRecipeConfigSchema.optional(),
});

export const RecipeIdRequestSchema = z.object({
  id: z.string().min(1).max(64),
});

export const RecipeSetDefaultRequestSchema = z.object({
  id: z.string().min(1).max(64),
});

export const RecipeImportRequestSchema = z.object({
  payload: z.unknown(),
  name: z.string().min(1).max(200).optional(),
});

export const RecipeExportResponseSchema = z.object({
  envelope: RecipeExportEnvelopeSchema,
});

export const CampaignCreateRequestSchema = z.object({
  title: z.string().min(1).max(200),
  recipeId: z.string().min(1).max(64),
});

export const CampaignIdRequestSchema = z.object({
  campaignId: z.string().uuid(),
});

export const CampaignSetProjectOverrideRequestSchema = z.object({
  campaignId: z.string().uuid(),
  projectId: z.string().uuid(),
  override: TranslationRecipeOverrideSchema.nullable(),
});

export const ProjectRecipeOverrideRequestSchema = z.object({
  projectId: z.string().uuid(),
  recipeId: z.string().min(1).max(64).nullable().optional(),
  override: TranslationRecipeOverrideSchema.nullable().optional(),
});

export const RecipeListRequestSchema = z.object({
  locale: z.enum(['en', 'vi']).default('en'),
});

export const RecipeListResponseSchema = z.object({
  recipes: z.array(RecipeListItemSchema),
  defaultRecipeId: z.string(),
});

export const RecipeItemResponseSchema = z.object({
  recipe: RecipeListItemSchema,
});

export const RecipeDeleteResponseSchema = z.object({
  ok: z.literal(true),
});

export const RecipeSetDefaultResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});

export const RecipeResolveProjectRequestSchema = z.object({
  projectId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
});

export const RecipeResolveResponseSchema = z.object({
  resolved: RecipeResolveResultSchema,
});

export const CampaignCreateResponseSchema = z.object({
  campaign: z.object({
    campaignId: z.string().uuid(),
    title: z.string(),
    recipeId: z.string(),
    status: z.string(),
    snapshot: z.object({
      recipeId: z.string(),
      version: z.string(),
      mode: z.enum(TRANSLATION_RECIPE_MODES),
      name: z.string(),
      config: TranslationRecipeConfigSchema,
      snapshottedAt: z.string(),
    }),
  }),
});

export const CampaignGetResponseSchema = z.object({
  campaign: z.object({
    campaignId: z.string().uuid(),
    title: z.string(),
    recipeId: z.string(),
    status: z.string(),
    snapshot: z.object({
      recipeId: z.string(),
      version: z.string(),
      mode: z.enum(TRANSLATION_RECIPE_MODES),
      name: z.string(),
      config: TranslationRecipeConfigSchema,
      snapshottedAt: z.string(),
    }),
    projects: z.array(
      z.object({
        projectId: z.string().uuid(),
        override: TranslationRecipeOverrideSchema.nullable(),
      }),
    ),
  }),
});

export const CampaignListResponseSchema = z.object({
  campaigns: z.array(
    z.object({
      campaignId: z.string().uuid(),
      title: z.string(),
      recipeId: z.string(),
      status: z.string(),
      updatedAt: z.string(),
    }),
  ),
});
