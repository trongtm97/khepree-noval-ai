/** Translation campaign orchestration (Prompt 05). */

export const TRANSLATION_CAMPAIGN_STATUSES = [
  'DRAFT',
  'PREFLIGHT',
  'READY',
  'STARTING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'PARTIAL_FAILED',
  'CANCELLED',
  'FAILED',
] as const;

export type TranslationCampaignStatus = (typeof TRANSLATION_CAMPAIGN_STATUSES)[number];

export const TRANSLATION_CAMPAIGN_PROJECT_STATUSES = [
  'PENDING',
  'READY',
  'NEEDS_ATTENTION',
  'QUEUED',
  'RUNNING',
  'SKIPPED',
  'FAILED',
  'COMPLETED',
] as const;

export type TranslationCampaignProjectStatus =
  (typeof TRANSLATION_CAMPAIGN_PROJECT_STATUSES)[number];

export const CAMPAIGN_BLOCKER_CODES = [
  'NO_CHAPTERS',
  'ALL_TRANSLATED',
  'SOURCE_CONFLICT',
  'SOURCE_ERROR',
  'PROVIDER_NOT_READY',
  'LICENSE_FEATURE',
  'CAPABILITY_LIMIT',
  'DUPLICATE_PROJECT',
  'PROJECT_MISSING',
] as const;

export type CampaignBlockerCode = (typeof CAMPAIGN_BLOCKER_CODES)[number];

/**
 * Capability keys from Khepree lease / local override — never plan names or prices.
 * Integer features preferred when lease provides them.
 */
export const CAMPAIGN_CAPABILITY_KEYS = {
  maxProjects: 'campaign.max_projects',
  maxConcurrentNovels: 'campaign.max_concurrent_novels',
} as const;

/** Soft defaults when lease omits integers (not prices). */
export const CAMPAIGN_DEFAULT_LIMITS = {
  maxProjects: 50,
  maxConcurrentNovels: 3,
} as const;

export const CAMPAIGN_APP_META_LIMIT_KEYS = {
  maxProjects: 'campaign.capability.max_projects',
  maxConcurrentNovels: 'campaign.capability.max_concurrent_novels',
} as const;

/** Relative effort units for plan estimates (not token cost). */
export const CAMPAIGN_EFFORT_WEIGHTS = {
  chapterBase: 1,
  charPerThousand: 0.15,
  repairRound: 0.35,
  publicationAudit: 2,
} as const;
