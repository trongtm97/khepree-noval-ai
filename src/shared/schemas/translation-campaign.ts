import { z } from 'zod';
import {
  CAMPAIGN_BLOCKER_CODES,
  TRANSLATION_CAMPAIGN_PROJECT_STATUSES,
  TRANSLATION_CAMPAIGN_STATUSES,
} from '../constants/translation-campaign';
import { TRANSLATION_RECIPE_MODES } from '../constants/translation-recipes';
import { TranslationRecipeOverrideSchema } from '../constants/translation-recipe-defs';

export const CampaignProjectPreflightSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string(),
  status: z.enum(TRANSLATION_CAMPAIGN_PROJECT_STATUSES),
  selected: z.boolean(),
  blockerCode: z.enum(CAMPAIGN_BLOCKER_CODES).nullable(),
  blockerMessage: z.string().nullable(),
  chaptersTotal: z.number().int().nonnegative(),
  chaptersUntranslated: z.number().int().nonnegative(),
  chaptersTranslated: z.number().int().nonnegative(),
  chaptersHumanLocked: z.number().int().nonnegative(),
  chaptersSourceConflict: z.number().int().nonnegative(),
  chaptersSourceError: z.number().int().nonnegative(),
  approximateCharsRemaining: z.number().int().nonnegative(),
  providerReady: z.boolean(),
  providerMessage: z.string().nullable(),
  relativeEffortUnits: z.number().nonnegative(),
  estimatedMinutes: z.number().nonnegative().nullable(),
});

export type CampaignProjectPreflightDto = z.infer<typeof CampaignProjectPreflightSchema>;

export const CampaignPlanEstimateSchema = z.object({
  projectCount: z.number().int().nonnegative(),
  runnableCount: z.number().int().nonnegative(),
  needsAttentionCount: z.number().int().nonnegative(),
  chaptersToTranslate: z.number().int().nonnegative(),
  approximateChars: z.number().int().nonnegative(),
  relativeProcessingRounds: z.number().nonnegative(),
  estimatedMinutesMin: z.number().nonnegative().nullable(),
  estimatedMinutesMax: z.number().nonnegative().nullable(),
  estimateBasis: z.enum(['insufficient_history', 'local_history']),
  capabilityMaxProjects: z.number().int().positive(),
  capabilityMaxConcurrentNovels: z.number().int().positive(),
});

export type CampaignPlanEstimateDto = z.infer<typeof CampaignPlanEstimateSchema>;

export const CampaignPlanSchema = z.object({
  campaignId: z.string().uuid(),
  title: z.string(),
  status: z.enum(TRANSLATION_CAMPAIGN_STATUSES),
  recipeId: z.string(),
  recipeMode: z.enum(TRANSLATION_RECIPE_MODES),
  recipeName: z.string(),
  projects: z.array(CampaignProjectPreflightSchema),
  estimate: CampaignPlanEstimateSchema,
  canStart: z.boolean(),
  startBlockedReason: z.string().nullable(),
  updatedAt: z.string(),
});

export type CampaignPlanDto = z.infer<typeof CampaignPlanSchema>;

export const CampaignCreateWithProjectsRequestSchema = z.object({
  title: z.string().min(1).max(200),
  recipeId: z.string().min(1).max(64),
  projectIds: z.array(z.string().uuid()).max(200).default([]),
});

export const CampaignAddProjectsRequestSchema = z.object({
  campaignId: z.string().uuid(),
  projectIds: z.array(z.string().uuid()).min(1).max(200),
});

export const CampaignRemoveProjectRequestSchema = z.object({
  campaignId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export const CampaignPreflightRequestSchema = z.object({
  campaignId: z.string().uuid(),
});

export const CampaignStartRequestSchema = z.object({
  campaignId: z.string().uuid(),
  /** Client-generated token — same token on retry/double-click is idempotent. */
  startToken: z.string().min(8).max(128),
});

export const CampaignControlRequestSchema = z.object({
  campaignId: z.string().uuid(),
});

export const CampaignStartResultSchema = z.object({
  campaignId: z.string().uuid(),
  status: z.enum(TRANSLATION_CAMPAIGN_STATUSES),
  idempotentReplay: z.boolean(),
  jobsCreated: z.number().int().nonnegative(),
  jobsReused: z.number().int().nonnegative(),
  projectsStarted: z.number().int().nonnegative(),
  projectsSkipped: z.number().int().nonnegative(),
  plan: CampaignPlanSchema,
});

export type CampaignStartResultDto = z.infer<typeof CampaignStartResultSchema>;

export const CampaignPlanResponseSchema = z.object({
  plan: CampaignPlanSchema,
});

export const CampaignStartResponseSchema = z.object({
  result: CampaignStartResultSchema,
});

/** Per-novel row inside campaign detail (production center). */
export const CampaignProjectRuntimeSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string(),
  status: z.enum(TRANSLATION_CAMPAIGN_PROJECT_STATUSES),
  /** Pipeline stage id — UI maps to friendly label; never show raw ops jargon. */
  stage: z.string().nullable(),
  progressPercent: z.number().min(0).max(100),
  providerShort: z.string().nullable(),
  accountShort: z.string().nullable(),
  estimatedMinutes: z.number().nonnegative().nullable(),
  priority: z.number().int(),
  attentionCount: z.number().int().nonnegative(),
  jobId: z.string().uuid().nullable(),
  canPause: z.boolean(),
  canRetry: z.boolean(),
});

export const CampaignAdvancedStatsSchema = z.object({
  accountsReady: z.number().int().nonnegative(),
  accountsTotal: z.number().int().nonnegative(),
  jobsInFlight: z.number().int().nonnegative(),
  maxConcurrent: z.number().int().nonnegative().nullable(),
});

export const CampaignDetailSchema = z.object({
  campaignId: z.string().uuid(),
  title: z.string(),
  status: z.enum(TRANSLATION_CAMPAIGN_STATUSES),
  recipeId: z.string(),
  recipeMode: z.enum(TRANSLATION_RECIPE_MODES),
  recipeName: z.string().optional(),
  startToken: z.string().nullable(),
  startedAt: z.string().nullable(),
  pausedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  projectCount: z.number().int().nonnegative(),
  jobCount: z.number().int().nonnegative(),
  /** 0–100 overall progress across linked novels. */
  progressPercent: z.number().min(0).max(100),
  completedCount: z.number().int().nonnegative(),
  runningCount: z.number().int().nonnegative(),
  attentionCount: z.number().int().nonnegative(),
  estimatedMinutesMin: z.number().nonnegative().nullable(),
  estimatedMinutesMax: z.number().nonnegative().nullable(),
  estimateBasis: z.enum(['insufficient_history', 'local_history']),
  plan: CampaignPlanSchema.nullable(),
  /** Per-novel runtime rows for production detail UI. */
  projects: z.array(CampaignProjectRuntimeSchema).default([]),
  /** Advanced ops signals — hide from novice UI by default. */
  advanced: CampaignAdvancedStatsSchema.nullable(),
});

export const CampaignDetailResponseSchema = z.object({
  campaign: CampaignDetailSchema,
});

export const CampaignListItemSchema = z.object({
  campaignId: z.string().uuid(),
  title: z.string(),
  status: z.enum(TRANSLATION_CAMPAIGN_STATUSES),
  recipeId: z.string(),
  recipeMode: z.enum(TRANSLATION_RECIPE_MODES),
  recipeName: z.string(),
  projectCount: z.number().int().nonnegative(),
  progressPercent: z.number().min(0).max(100),
  completedCount: z.number().int().nonnegative(),
  runningCount: z.number().int().nonnegative(),
  attentionCount: z.number().int().nonnegative(),
  estimatedMinutesMin: z.number().nonnegative().nullable(),
  estimatedMinutesMax: z.number().nonnegative().nullable(),
  estimateBasis: z.enum(['insufficient_history', 'local_history']),
  updatedAt: z.string(),
});

export const CampaignListResponseSchema = z.object({
  campaigns: z.array(CampaignListItemSchema),
});

export const CampaignSetProjectOverrideRequestSchema = z.object({
  campaignId: z.string().uuid(),
  projectId: z.string().uuid(),
  override: TranslationRecipeOverrideSchema.nullable(),
});

export const CampaignProjectControlRequestSchema = z.object({
  campaignId: z.string().uuid(),
  projectId: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'retry', 'setPriority']),
  priority: z.number().int().min(0).max(1000).optional(),
});

export type CampaignProjectRuntimeDto = z.infer<typeof CampaignProjectRuntimeSchema>;
export type CampaignListItemDto = z.infer<typeof CampaignListItemSchema>;
export type CampaignDetailDto = z.infer<typeof CampaignDetailSchema>;
