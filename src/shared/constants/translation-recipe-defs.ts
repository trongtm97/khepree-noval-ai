import { z } from 'zod';
import { BOOTSTRAP_MODES } from './bootstrap';
import {
  BUILTIN_RECIPE_IDS,
  DEFAULT_TRANSLATION_RECIPE_ID,
  TRANSLATION_RECIPE_CONFIG_VERSION,
  TRANSLATION_RECIPE_MODES,
  TRANSLATION_RECIPE_QA_LEVELS,
  TRANSLATION_RECIPE_REPAIR_SCOPES,
  type TranslationRecipeMode,
} from './translation-recipes';

/**
 * Executable knobs for a translation recipe.
 * No cookies, tokens, profile paths, or secrets — only behavioral flags.
 */
export interface TranslationRecipeConfig {
  configVersion: number;
  mode: TranslationRecipeMode;
  bootstrapMode: (typeof BOOTSTRAP_MODES)[number];
  bootstrapChapterCount: number;
  qaLevel: (typeof TRANSLATION_RECIPE_QA_LEVELS)[number];
  repairScope: (typeof TRANSLATION_RECIPE_REPAIR_SCOPES)[number];
  maxRepairAttempts: number;
  maxContinuationAttempts: number;
  endOfBookConsistencyReport: boolean;
  wholeBookAudit: boolean;
  /** Provider id preference order — ids only, never credentials. */
  providerPriority: string[];
  watchFolderEnabled: boolean | null;
  /** Soft export preference hints (formats), never absolute paths. */
  exportFormatHints: string[];
}

export interface BuiltinRecipeDefinition {
  id: string;
  mode: TranslationRecipeMode;
  version: string;
  nameEn: string;
  nameVi: string;
  descriptionEn: string;
  descriptionVi: string;
  tradeoffEn: string;
  tradeoffVi: string;
  config: TranslationRecipeConfig;
}

function baseConfig(
  mode: TranslationRecipeMode,
  patch: Omit<TranslationRecipeConfig, 'configVersion' | 'mode'>,
): TranslationRecipeConfig {
  return {
    configVersion: TRANSLATION_RECIPE_CONFIG_VERSION,
    mode,
    ...patch,
  };
}

export const BUILTIN_TRANSLATION_RECIPES: BuiltinRecipeDefinition[] = [
  {
    id: BUILTIN_RECIPE_IDS.QUICK,
    mode: 'QUICK',
    version: '1.0.0',
    nameEn: 'Quick',
    nameVi: 'Nhanh',
    descriptionEn: 'Translate with basic structure checks. Auto-fix only clear missing/extra/truncated issues.',
    descriptionVi:
      'Dịch kèm kiểm tra cấu trúc cơ bản. Chỉ tự sửa lỗi thiếu/thừa/truncated rõ ràng.',
    tradeoffEn: 'Faster · fewer browser rounds · lighter checks',
    tradeoffVi: 'Nhanh hơn · ít lượt trình duyệt hơn · kiểm tra nhẹ hơn',
    config: baseConfig('QUICK', {
      bootstrapMode: 'SAFE',
      bootstrapChapterCount: 5,
      qaLevel: 'basic',
      repairScope: 'structure_only',
      maxRepairAttempts: 1,
      maxContinuationAttempts: 2,
      endOfBookConsistencyReport: false,
      wholeBookAudit: false,
      providerPriority: [],
      watchFolderEnabled: null,
      exportFormatHints: ['txt'],
    }),
  },
  {
    id: BUILTIN_RECIPE_IDS.BALANCED,
    mode: 'BALANCED',
    version: '1.0.0',
    nameEn: 'Balanced',
    nameVi: 'Cân bằng',
    descriptionEn:
      'Bootstrap glossary/memory, translate, reasonable full QA and targeted repair. Standard end-of-book consistency report.',
    descriptionVi:
      'Bootstrap glossary/memory, dịch, QA đầy đủ hợp lý và sửa có mục tiêu. Báo cáo nhất quán cuối truyện ở mức tiêu chuẩn.',
    tradeoffEn: 'Default balance of speed and thoroughness',
    tradeoffVi: 'Cân bằng tốc độ và mức kiểm tra (mặc định)',
    config: baseConfig('BALANCED', {
      bootstrapMode: 'BALANCED',
      bootstrapChapterCount: 10,
      qaLevel: 'standard',
      repairScope: 'targeted',
      maxRepairAttempts: 2,
      maxContinuationAttempts: 3,
      endOfBookConsistencyReport: true,
      wholeBookAudit: false,
      providerPriority: [],
      watchFolderEnabled: null,
      exportFormatHints: ['txt'],
    }),
  },
  {
    id: BUILTIN_RECIPE_IDS.PUBLICATION,
    mode: 'PUBLICATION',
    version: '1.0.0',
    nameEn: 'Publication',
    nameVi: 'Xuất bản',
    descriptionEn:
      'Deeper bootstrap, strict QA, bounded repair, and Whole-book Audit. Uses existing providers only — no official paid AI API.',
    descriptionVi:
      'Bootstrap sâu hơn, QA nghiêm ngặt, repair có giới hạn và Whole-book Audit. Chỉ dùng provider hiện có — không API AI chính thức.',
    tradeoffEn: 'More thorough checks · more processing rounds · takes longer',
    tradeoffVi: 'Kiểm tra kỹ hơn · nhiều lượt xử lý hơn · mất nhiều thời gian hơn',
    config: baseConfig('PUBLICATION', {
      bootstrapMode: 'DEEP',
      bootstrapChapterCount: 20,
      qaLevel: 'strict',
      repairScope: 'bounded',
      maxRepairAttempts: 4,
      maxContinuationAttempts: 4,
      endOfBookConsistencyReport: true,
      wholeBookAudit: true,
      providerPriority: [],
      watchFolderEnabled: null,
      exportFormatHints: ['txt', 'epub'],
    }),
  },
];

export function getBuiltinRecipe(id: string): BuiltinRecipeDefinition | undefined {
  return BUILTIN_TRANSLATION_RECIPES.find((r) => r.id === id);
}

export function isBuiltinRecipeId(id: string): boolean {
  return BUILTIN_TRANSLATION_RECIPES.some((r) => r.id === id);
}

export function builtinRecipeByMode(mode: TranslationRecipeMode): BuiltinRecipeDefinition {
  const found = BUILTIN_TRANSLATION_RECIPES.find((r) => r.mode === mode);
  if (!found) {
    return getBuiltinRecipe(DEFAULT_TRANSLATION_RECIPE_ID)!;
  }
  return found;
}

export const TranslationRecipeConfigSchema = z.object({
  configVersion: z.number().int().positive(),
  mode: z.enum(TRANSLATION_RECIPE_MODES),
  bootstrapMode: z.enum(BOOTSTRAP_MODES),
  bootstrapChapterCount: z.number().int().min(1).max(20),
  qaLevel: z.enum(TRANSLATION_RECIPE_QA_LEVELS),
  repairScope: z.enum(TRANSLATION_RECIPE_REPAIR_SCOPES),
  maxRepairAttempts: z.number().int().min(0).max(10),
  maxContinuationAttempts: z.number().int().min(0).max(10),
  endOfBookConsistencyReport: z.boolean(),
  wholeBookAudit: z.boolean(),
  providerPriority: z.array(z.string().min(1).max(64)).max(20),
  watchFolderEnabled: z.boolean().nullable(),
  exportFormatHints: z.array(z.string().min(1).max(32)).max(10),
});

export type TranslationRecipeConfigDto = z.infer<typeof TranslationRecipeConfigSchema>;

/** Partial override applied on top of a base recipe (campaign project / project). */
export const TranslationRecipeOverrideSchema = TranslationRecipeConfigSchema.partial().omit({
  configVersion: true,
  mode: true,
});

export type TranslationRecipeOverrideDto = z.infer<typeof TranslationRecipeOverrideSchema>;

export function mergeRecipeConfig(
  base: TranslationRecipeConfig,
  override?: TranslationRecipeOverrideDto | null,
): TranslationRecipeConfig {
  if (!override) {
    return {
      ...base,
      providerPriority: [...base.providerPriority],
      exportFormatHints: [...base.exportFormatHints],
    };
  }
  return {
    ...base,
    ...override,
    configVersion: base.configVersion,
    mode: base.mode,
    providerPriority: override.providerPriority ?? [...base.providerPriority],
    exportFormatHints: override.exportFormatHints ?? [...base.exportFormatHints],
  };
}
