/**
 * Durable per-project campaign pipeline stages (Prompt 08).
 * Resume from checkpoint after app restart — no full-novel re-run.
 */

export const CAMPAIGN_PIPELINE_STAGES = [
  'INTAKE',
  'PREFLIGHT',
  'BOOTSTRAP',
  'TRANSLATION',
  'QA_REPAIR',
  'WHOLE_BOOK_AUDIT',
  'DELIVERY',
] as const;

export type CampaignPipelineStage = (typeof CAMPAIGN_PIPELINE_STAGES)[number];

/** Stage / run outcome statuses. */
export const CAMPAIGN_PIPELINE_STAGE_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'SKIPPED',
  'FAILED_RETRYABLE',
  'NEEDS_ATTENTION',
  'FAILED_FINAL',
] as const;

export type CampaignPipelineStageStatus =
  (typeof CAMPAIGN_PIPELINE_STAGE_STATUSES)[number];

export const CAMPAIGN_PIPELINE_RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'SKIPPED',
  'FAILED_RETRYABLE',
  'NEEDS_ATTENTION',
  'FAILED_FINAL',
  'CANCELLED',
] as const;

export type CampaignPipelineRunStatus =
  (typeof CAMPAIGN_PIPELINE_RUN_STATUSES)[number];

export const PIPELINE_TERMINAL_STAGE_STATUSES: ReadonlySet<CampaignPipelineStageStatus> =
  new Set(['COMPLETED', 'SKIPPED', 'NEEDS_ATTENTION', 'FAILED_FINAL']);

export const PIPELINE_TERMINAL_RUN_STATUSES: ReadonlySet<CampaignPipelineRunStatus> =
  new Set([
    'COMPLETED',
    'SKIPPED',
    'NEEDS_ATTENTION',
    'FAILED_FINAL',
    'CANCELLED',
  ]);

export const PIPELINE_FAILURE_RUN_STATUSES: ReadonlySet<CampaignPipelineRunStatus> =
  new Set(['NEEDS_ATTENTION', 'FAILED_FINAL', 'FAILED_RETRYABLE']);

export function pipelineStageRank(stage: CampaignPipelineStage): number {
  const i = CAMPAIGN_PIPELINE_STAGES.indexOf(stage);
  return i >= 0 ? i : -1;
}

export function isPipelineStageAtLeast(
  current: CampaignPipelineStage,
  target: CampaignPipelineStage,
): boolean {
  return pipelineStageRank(current) >= pipelineStageRank(target);
}

export function nextPipelineStage(
  stage: CampaignPipelineStage,
): CampaignPipelineStage | null {
  const i = CAMPAIGN_PIPELINE_STAGES.indexOf(stage);
  if (i < 0 || i >= CAMPAIGN_PIPELINE_STAGES.length - 1) return null;
  return CAMPAIGN_PIPELINE_STAGES[i + 1]!;
}

/** Idempotency key: campaign + project + stage + startToken (+ attempt for retry). */
export function buildStageIdempotencyKey(input: {
  campaignId: string;
  projectId: string;
  stage: CampaignPipelineStage;
  startToken: string;
  attempt: number;
}): string {
  return `cp:${input.campaignId}:${input.projectId}:${input.stage}:${input.startToken}:a${input.attempt}`;
}
