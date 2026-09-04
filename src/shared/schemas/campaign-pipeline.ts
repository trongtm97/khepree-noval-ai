import { z } from 'zod';
import {
  CAMPAIGN_PIPELINE_RUN_STATUSES,
  CAMPAIGN_PIPELINE_STAGE_STATUSES,
  CAMPAIGN_PIPELINE_STAGES,
} from '../constants/campaign-pipeline';
import { TRANSLATION_RECIPE_MODES } from '../constants/translation-recipes';

export const CampaignPipelineStageInputSchema = z.object({
  campaignId: z.string().uuid(),
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
  stage: z.enum(CAMPAIGN_PIPELINE_STAGES),
  recipeMode: z.enum(TRANSLATION_RECIPE_MODES),
  startToken: z.string().min(1),
  attempt: z.number().int().positive(),
});

export type CampaignPipelineStageInput = z.infer<
  typeof CampaignPipelineStageInputSchema
>;

export const CampaignPipelineSideEffectsSchema = z.object({
  /** Jobs enqueued for TRANSLATION (once). */
  translationEnqueued: z.boolean().optional(),
  /** Bootstrap prepare called (once). */
  bootstrapPrepared: z.boolean().optional(),
  /** Delivery / export-ready marked (once). */
  deliveryMarked: z.boolean().optional(),
  /** Notification / attention item created (once). */
  attentionNotified: z.boolean().optional(),
  /** Auto-export wrote files for this delivery fingerprint. */
  deliveryExported: z.boolean().optional(),
  deliveryExportFingerprint: z.string().max(500).optional(),
  deliveryFilePaths: z.array(z.string().max(1000)).max(20).optional(),
  deliveryPrimaryPath: z.string().max(1000).nullable().optional(),
  deliveryManifestPath: z.string().max(1000).nullable().optional(),
  deliveryOutputDirectory: z.string().max(1000).nullable().optional(),
  /** In-app + desktop completion notify emitted (once per delivery). */
  completionNotified: z.boolean().optional(),
});

export type CampaignPipelineSideEffects = z.infer<
  typeof CampaignPipelineSideEffectsSchema
>;

export const CampaignPipelineCheckpointSchema = z.object({
  message: z.string().optional(),
  jobIds: z.array(z.string()).optional(),
  chaptersTotal: z.number().int().nonnegative().optional(),
  chaptersDone: z.number().int().nonnegative().optional(),
  humanLockedCount: z.number().int().nonnegative().optional(),
  consistencySummary: z.string().optional(),
  auditCriticalCount: z.number().int().nonnegative().optional(),
  auditSkippedReason: z.string().optional(),
  deliveryReady: z.boolean().optional(),
  accountId: z.string().nullable().optional(),
  /** HR16: story NotebookLM id resolved via NotebookBindingService (never created here). */
  notebookId: z.string().nullable().optional(),
});

export type CampaignPipelineCheckpoint = z.infer<
  typeof CampaignPipelineCheckpointSchema
>;

export const CampaignPipelineStageOutputSchema = z.object({
  status: z.enum(CAMPAIGN_PIPELINE_STAGE_STATUSES),
  checkpoint: CampaignPipelineCheckpointSchema.optional(),
  sideEffects: CampaignPipelineSideEffectsSchema.optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  /** Async stage still waiting (e.g. jobs running). */
  wait: z.boolean().optional(),
});

export type CampaignPipelineStageOutput = z.infer<
  typeof CampaignPipelineStageOutputSchema
>;

export const CampaignPipelineRetryStageRequestSchema = z.object({
  campaignId: z.string().uuid(),
  projectId: z.string().uuid(),
  stage: z.enum(CAMPAIGN_PIPELINE_STAGES),
});

export const CampaignPipelineSkipStageRequestSchema = z.object({
  campaignId: z.string().uuid(),
  projectId: z.string().uuid(),
  stage: z.enum(CAMPAIGN_PIPELINE_STAGES),
});

export const CampaignPipelineRestartFromStageRequestSchema = z.object({
  campaignId: z.string().uuid(),
  projectId: z.string().uuid(),
  stage: z.enum(CAMPAIGN_PIPELINE_STAGES),
});

export const CampaignPipelineRunDtoSchema = z.object({
  runId: z.string().uuid(),
  campaignId: z.string().uuid(),
  projectId: z.string().uuid(),
  currentStage: z.enum(CAMPAIGN_PIPELINE_STAGES),
  status: z.enum(CAMPAIGN_PIPELINE_RUN_STATUSES),
  recipeMode: z.enum(TRANSLATION_RECIPE_MODES),
  startToken: z.string(),
});

export type CampaignPipelineRunDto = z.infer<typeof CampaignPipelineRunDtoSchema>;
