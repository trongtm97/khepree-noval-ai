import { z } from 'zod';
import { NOVEL_EXPORT_FORMATS } from '../constants/portability';

/** Main → renderer completion event (no secrets / cookies / full prompts). */
export const ProductionCompletionEventSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(['PROJECT_DELIVERED', 'CAMPAIGN_COMPLETED', 'CAMPAIGN_NEEDS_ATTENTION']),
  title: z.string().min(1).max(200),
  description: z.string().max(500),
  campaignId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  projectTitle: z.string().max(200).nullable(),
  /** In-app navigation target (hash router path). */
  route: z.string().max(300).nullable(),
  outputDirectory: z.string().max(1000).nullable(),
  primaryFilePath: z.string().max(1000).nullable(),
  manifestPath: z.string().max(1000).nullable(),
  formats: z.array(z.enum(NOVEL_EXPORT_FORMATS)).default([]),
  warnings: z.array(z.string().max(300)).max(20).default([]),
  desktopNotify: z.boolean().default(true),
  /** True when desktop notification was clicked — renderer should navigate. */
  openTarget: z.boolean().default(false),
});

export type ProductionCompletionEvent = z.infer<
  typeof ProductionCompletionEventSchema
>;

export const DeliveryManifestSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('khepree-delivery-manifest'),
  campaignId: z.string().uuid().nullable(),
  projectId: z.string().uuid(),
  projectTitle: z.string(),
  chaptersExported: z.number().int().nonnegative(),
  paragraphsExported: z.number().int().nonnegative(),
  sourceRevisionHint: z.string().nullable(),
  recipe: z.object({
    recipeId: z.string(),
    mode: z.string(),
    configVersion: z.number().int().nonnegative(),
    /** Behavioral snapshot only — never credentials. */
    qaLevel: z.string().optional(),
    repairScope: z.string().optional(),
    wholeBookAudit: z.boolean().optional(),
    exportFormatHints: z.array(z.string()).optional(),
  }),
  auditSummary: z.string().nullable(),
  warnings: z.array(z.string()),
  exportedFiles: z.array(
    z.object({
      format: z.string(),
      fileName: z.string(),
      /** Relative to output directory when possible. */
      relativePath: z.string(),
    }),
  ),
  startedAt: z.string().nullable(),
  completedAt: z.string(),
  fingerprint: z.string(),
});

export type DeliveryManifest = z.infer<typeof DeliveryManifestSchema>;
