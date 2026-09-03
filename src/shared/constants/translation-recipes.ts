/** Translation recipe modes — distinct from bootstrap SAFE/BALANCED/DEEP and style presets. */

export const TRANSLATION_RECIPE_MODES = ['QUICK', 'BALANCED', 'PUBLICATION'] as const;
export type TranslationRecipeMode = (typeof TRANSLATION_RECIPE_MODES)[number];

export const TRANSLATION_RECIPE_QA_LEVELS = ['basic', 'standard', 'strict'] as const;
export type TranslationRecipeQaLevel = (typeof TRANSLATION_RECIPE_QA_LEVELS)[number];

export const TRANSLATION_RECIPE_REPAIR_SCOPES = [
  'structure_only',
  'targeted',
  'bounded',
] as const;
export type TranslationRecipeRepairScope = (typeof TRANSLATION_RECIPE_REPAIR_SCOPES)[number];

/** Builtin recipe stable IDs (never change). */
export const BUILTIN_RECIPE_IDS = {
  QUICK: 'builtin-quick',
  BALANCED: 'builtin-balanced',
  PUBLICATION: 'builtin-publication',
} as const;

export const DEFAULT_TRANSLATION_RECIPE_ID = BUILTIN_RECIPE_IDS.BALANCED;

export const TRANSLATION_RECIPE_APP_META_KEYS = {
  defaultRecipeId: 'settings.default_translation_recipe_id',
} as const;

/** Current schema version for recipe config JSON (export/import). */
export const TRANSLATION_RECIPE_CONFIG_VERSION = 1;

/** Exact cost disclaimer (Prompt 04) — keep in sync with i18n. */
export const TRANSLATION_RECIPE_COST_DISCLAIMER_EN =
  'Không dùng API AI tính phí. Có thể phát sinh chi phí tài khoản/thuê bao, máy tính và mạng của người dùng.';

export const TRANSLATION_RECIPE_COST_DISCLAIMER_VI =
  'Không dùng API AI tính phí. Có thể phát sinh chi phí tài khoản/thuê bao, máy tính và mạng của người dùng.';
