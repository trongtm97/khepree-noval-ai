import {
  CAMPAIGN_APP_META_LIMIT_KEYS,
  CAMPAIGN_DEFAULT_LIMITS,
} from '@shared/constants/translation-campaign';
import type { DatabaseManager } from '../db/database-manager';
import type { CampaignPipelineRunRow } from '../db/repositories/campaign-pipeline-repository';
import {
  buildStageIdempotencyKey,
  CAMPAIGN_PIPELINE_STAGES,
  nextPipelineStage,
  PIPELINE_FAILURE_RUN_STATUSES,
  PIPELINE_TERMINAL_RUN_STATUSES,
  PIPELINE_TERMINAL_STAGE_STATUSES,
  type CampaignPipelineRunStatus,
  type CampaignPipelineStage,
  type CampaignPipelineStageStatus,
} from '@shared/constants/campaign-pipeline';
import {
  TranslationRecipeConfigSchema,
  type TranslationRecipeConfig,
} from '@shared/constants/translation-recipe-defs';
import type { TranslationRecipeMode } from '@shared/constants/translation-recipes';
import { getDatabase } from '../db/connection';
import { utcNow } from '../db/utils/timestamps';
import { logger } from '../logging/logger';
import { STAGE_HANDLERS } from './stage-handlers';
import {
  emitProductionCompletion,
} from '../production/completion-notify-bridge';
import { buildCampaignCompletionEvent } from '../portability/delivery-export-service';

export interface CampaignPipelineOrchestratorOptions {
  skipBrowser?: boolean;
  crashAfterSideEffect?: string | null;
  preferredAccountId?: string | null;
}

function mapStageStatusToRun(
  status: CampaignPipelineStageStatus,
): CampaignPipelineRunStatus {
  switch (status) {
    case 'COMPLETED':
    case 'SKIPPED':
      return 'RUNNING';
    case 'RUNNING':
    case 'PENDING':
      return 'RUNNING';
    case 'FAILED_RETRYABLE':
      return 'FAILED_RETRYABLE';
    case 'NEEDS_ATTENTION':
      return 'NEEDS_ATTENTION';
    case 'FAILED_FINAL':
      return 'FAILED_FINAL';
    default:
      return 'RUNNING';
  }
}

export class CampaignPipelineOrchestrator {
  constructor(
    private readonly db: DatabaseManager,
    private readonly options: CampaignPipelineOrchestratorOptions = {},
  ) {}

  /**
   * Create durable runs for selected runnable projects (idempotent per startToken).
   */
  bootstrapRuns(input: {
    campaignId: string;
    startToken: string;
    recipeMode: TranslationRecipeMode;
    projectIds: string[];
  }): CampaignPipelineRunRow[] {
    const runs: CampaignPipelineRunRow[] = [];
    for (const projectId of input.projectIds) {
      const run = this.db.campaignPipeline.createRun({
        campaignId: input.campaignId,
        projectId,
        recipeMode: input.recipeMode,
        startToken: input.startToken,
      });
      runs.push(run);
      this.db.translationCampaigns.updateProject(input.campaignId, projectId, {
        status: 'QUEUED',
      });
    }
    return runs;
  }

  /** Resume all active pipeline runs after app restart. */
  async resumeActive(): Promise<{ advanced: number; errors: number }> {
    try {
      if (!this.db.getConnection().open) {
        return { advanced: 0, errors: 0 };
      }
    } catch {
      return { advanced: 0, errors: 0 };
    }
    let runs: ReturnType<typeof this.db.campaignPipeline.listActiveRuns>;
    try {
      runs = this.db.campaignPipeline.listActiveRuns();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not open|closed/i.test(message)) return { advanced: 0, errors: 0 };
      throw error;
    }
    let advanced = 0;
    let errors = 0;
    for (const run of runs) {
      const campaign = this.db.translationCampaigns.getById(run.campaign_id);
      if (!campaign) continue;
      if (
        campaign.status === 'PAUSED' ||
        campaign.status === 'CANCELLED'
      ) {
        continue;
      }
      try {
        const changed = await this.tickRun(run.id);
        if (changed) advanced += 1;
      } catch (err: unknown) {
        errors += 1;
        logger.warn('Campaign pipeline resume tick failed', {
          runId: run.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { advanced, errors };
  }

  async tickCampaign(campaignId: string): Promise<void> {
    const campaign = this.db.translationCampaigns.getById(campaignId);
    if (!campaign) return;
    if (campaign.status === 'PAUSED' || campaign.status === 'CANCELLED') {
      return;
    }

    this.promoteWaitingProjects(campaignId);

    const runs = this.db.campaignPipeline.listRunsByCampaign(campaignId);
    for (const run of runs) {
      if (PIPELINE_TERMINAL_RUN_STATUSES.has(run.status)) continue;
      if (run.status === 'PAUSED') continue;
      try {
        await this.tickRun(run.id);
      } catch (err: unknown) {
        // Isolate: one project failure must not stop others.
        logger.warn('Campaign pipeline project tick failed', {
          campaignId,
          projectId: run.project_id,
          message: err instanceof Error ? err.message : String(err),
        });
        this.db.campaignPipeline.updateRun(run.id, {
          status: 'FAILED_RETRYABLE',
          errorCode: 'TICK_EXCEPTION',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        this.db.translationCampaigns.updateProject(campaignId, run.project_id, {
          status: 'FAILED',
          blockerCode: 'SOURCE_ERROR',
        });
      }
    }

    this.reconcileCampaignStatus(campaignId);
  }

  /** Start READY waiting projects when active pipeline slots free up. */
  private promoteWaitingProjects(campaignId: string): void {
    const campaign = this.db.translationCampaigns.getById(campaignId);
    if (!campaign?.start_token) return;

    const metaMax = this.db.appMeta.get(CAMPAIGN_APP_META_LIMIT_KEYS.maxConcurrentNovels);
    const maxConcurrent = metaMax
      ? Math.max(1, Number.parseInt(metaMax, 10) || 1)
      : CAMPAIGN_DEFAULT_LIMITS.maxConcurrentNovels;

    const runs = this.db.campaignPipeline.listRunsByCampaign(campaignId);
    const active = runs.filter(
      (r) =>
        !PIPELINE_TERMINAL_RUN_STATUSES.has(r.status) && r.status !== 'PAUSED',
    ).length;
    const slots = Math.max(0, maxConcurrent - active);
    if (slots === 0) return;

    const waiting = this.db.translationCampaigns
      .listProjects(campaignId)
      .filter((p) => p.status === 'READY' && p.selected === 1)
      .slice(0, slots);

    if (waiting.length === 0) return;

    this.bootstrapRuns({
      campaignId,
      startToken: campaign.start_token,
      recipeMode: (JSON.parse(campaign.recipe_snapshot_json) as { mode?: TranslationRecipeMode })
        .mode ?? 'BALANCED',
      projectIds: waiting.map((p) => p.project_id),
    });
  }

  async tickRun(runId: string): Promise<boolean> {
    let run = this.db.campaignPipeline.getRunById(runId);
    if (!run) return false;
    if (PIPELINE_TERMINAL_RUN_STATUSES.has(run.status)) return false;
    if (run.status === 'PAUSED') return false;

    const campaign = this.db.translationCampaigns.getById(run.campaign_id);
    if (!campaign) return false;
    if (campaign.status === 'PAUSED' || campaign.status === 'CANCELLED') {
      return false;
    }

    const recipeConfig = this.resolveRecipeConfig(campaign.recipe_snapshot_json);
    let changed = false;

    // Advance through sync stages in one tick; stop on wait/failure.
    for (let guard = 0; guard < CAMPAIGN_PIPELINE_STAGES.length + 2; guard += 1) {
      run = this.db.campaignPipeline.getRunById(runId)!;
      if (PIPELINE_TERMINAL_RUN_STATUSES.has(run.status)) break;

      const stage = run.current_stage;
      const result = await this.executeStage(run, recipeConfig);

      if (result.errorCode === 'CRASH_SIM') {
        throw new Error(result.errorMessage ?? 'Simulated crash after side effect');
      }

      changed = true;

      if (result.wait || result.status === 'RUNNING') {
        this.db.campaignPipeline.updateRun(runId, {
          status: 'RUNNING',
          errorCode: null,
          errorMessage: null,
        });
        this.db.translationCampaigns.updateProject(run.campaign_id, run.project_id, {
          status: 'RUNNING',
        });
        break;
      }

      if (
        result.status === 'FAILED_RETRYABLE' ||
        result.status === 'NEEDS_ATTENTION' ||
        result.status === 'FAILED_FINAL'
      ) {
        const runStatus = mapStageStatusToRun(result.status);
        this.db.campaignPipeline.updateRun(runId, {
          status: runStatus,
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage ?? null,
        });
        this.db.translationCampaigns.updateProject(run.campaign_id, run.project_id, {
          status:
            result.status === 'NEEDS_ATTENTION' ? 'NEEDS_ATTENTION' : 'FAILED',
          blockerCode:
            result.status === 'NEEDS_ATTENTION' ? 'PROVIDER_NOT_READY' : 'SOURCE_ERROR',
        });
        break;
      }

      // COMPLETED or SKIPPED → advance
      const next = nextPipelineStage(stage);
      if (!next) {
        this.db.campaignPipeline.updateRun(runId, {
          status: 'COMPLETED',
          errorCode: null,
          errorMessage: null,
        });
        this.db.translationCampaigns.updateProject(run.campaign_id, run.project_id, {
          status: 'COMPLETED',
          blockerCode: null,
        });
        break;
      }

      this.db.campaignPipeline.updateRun(runId, {
        currentStage: next,
        status: 'RUNNING',
        errorCode: null,
        errorMessage: null,
      });
    }

    return changed;
  }

  private async executeStage(
    run: CampaignPipelineRunRow,
    recipeConfig: TranslationRecipeConfig,
  ): Promise<{
    status: CampaignPipelineStageStatus;
    wait?: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
  }> {
    const stage = run.current_stage;
    const attempt =
      this.db.campaignPipeline.getStage(run.id, stage)?.attempt ?? 1;
    const idempotencyKey = buildStageIdempotencyKey({
      campaignId: run.campaign_id,
      projectId: run.project_id,
      stage,
      startToken: run.start_token,
      attempt,
    });

    let stageRow = this.db.campaignPipeline.ensureStage({
      runId: run.id,
      stage,
      idempotencyKey,
      attempt,
      inputJson: JSON.stringify({
        campaignId: run.campaign_id,
        projectId: run.project_id,
        runId: run.id,
        stage,
        recipeMode: run.recipe_mode,
        startToken: run.start_token,
        attempt,
      }),
    });

    // Idempotent: already terminal for this key → return stored outcome
    if (PIPELINE_TERMINAL_STAGE_STATUSES.has(stageRow.status)) {
      return {
        status: stageRow.status,
        errorCode: stageRow.error_code,
        errorMessage: stageRow.error_message,
      };
    }

    if (stageRow.status === 'PENDING') {
      stageRow =
        this.db.campaignPipeline.updateStage(stageRow.id, {
          status: 'RUNNING',
          startedAt: stageRow.started_at ?? utcNow(),
        }) ?? stageRow;
    }

    const handler = STAGE_HANDLERS[stage];
    const output = await handler({
      db: this.db,
      campaignId: run.campaign_id,
      projectId: run.project_id,
      runId: run.id,
      stage,
      recipeMode: run.recipe_mode,
      recipeConfig,
      startToken: run.start_token,
      attempt,
      stageRow,
      crashAfterSideEffect: this.options.crashAfterSideEffect,
      skipBrowser: this.options.skipBrowser ?? true,
      preferredAccountId: this.options.preferredAccountId,
    });

    // Persist checkpoint + side effects BEFORE treating crash (once).
    this.db.campaignPipeline.updateStage(stageRow.id, {
      status: output.status,
      outputJson: JSON.stringify(output),
      checkpointJson: output.checkpoint
        ? JSON.stringify(output.checkpoint)
        : stageRow.checkpoint_json,
      sideEffectsJson: output.sideEffects
        ? JSON.stringify({
            ...this.db.campaignPipeline.parseSideEffects(stageRow),
            ...output.sideEffects,
          })
        : stageRow.side_effects_json,
      errorCode: output.errorCode ?? null,
      errorMessage: output.errorMessage ?? null,
      finishedAt: PIPELINE_TERMINAL_STAGE_STATUSES.has(output.status)
        ? utcNow()
        : null,
    });

    return {
      status: output.status,
      wait: output.wait,
      errorCode: output.errorCode,
      errorMessage: output.errorMessage,
    };
  }

  retryStage(
    campaignId: string,
    projectId: string,
    stage: CampaignPipelineStage,
  ): void {
    const campaign = this.db.translationCampaigns.getById(campaignId);
    if (!campaign?.start_token) throw new Error('Campaign has no start token');
    const run = this.db.campaignPipeline.getRunByFingerprint(
      campaignId,
      projectId,
      campaign.start_token,
    );
    if (!run) throw new Error('Pipeline run not found');

    const existing = this.db.campaignPipeline.getStage(run.id, stage);
    const nextAttempt = (existing?.attempt ?? 0) + 1;
    const key = buildStageIdempotencyKey({
      campaignId,
      projectId,
      stage,
      startToken: run.start_token,
      attempt: nextAttempt,
    });

    if (existing) {
      // Preserve prior side effects; new attempt gets new idempotency key.
      this.db.campaignPipeline.updateStage(existing.id, {
        status: 'PENDING',
        attempt: nextAttempt,
        idempotencyKey: key,
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
        startedAt: null,
        // Keep side_effects_json so enqueue does not repeat.
      });
    } else {
      this.db.campaignPipeline.ensureStage({
        runId: run.id,
        stage,
        idempotencyKey: key,
        attempt: nextAttempt,
      });
    }

    this.db.campaignPipeline.updateRun(run.id, {
      currentStage: stage,
      status: 'RUNNING',
      errorCode: null,
      errorMessage: null,
    });
    this.db.translationCampaigns.updateProject(campaignId, projectId, {
      status: 'RUNNING',
      blockerCode: null,
    });
    if (campaign.status === 'PARTIAL_FAILED' || campaign.status === 'COMPLETED') {
      this.db.translationCampaigns.updateCampaign(campaignId, {
        status: 'RUNNING',
        completedAt: null,
      });
    }
  }

  skipStage(
    campaignId: string,
    projectId: string,
    stage: CampaignPipelineStage,
  ): void {
    const campaign = this.db.translationCampaigns.getById(campaignId);
    if (!campaign?.start_token) throw new Error('Campaign has no start token');
    const run = this.db.campaignPipeline.getRunByFingerprint(
      campaignId,
      projectId,
      campaign.start_token,
    );
    if (!run) throw new Error('Pipeline run not found');

    // Policy: WHOLE_BOOK_AUDIT skippable; DELIVERY skippable; never skip if
    // would overwrite human_locked (delivery/audit don't write translations).
    const skippable: CampaignPipelineStage[] = [
      'WHOLE_BOOK_AUDIT',
      'DELIVERY',
      'BOOTSTRAP',
    ];
    if (!skippable.includes(stage)) {
      throw new Error(`Stage ${stage} cannot be skipped by policy`);
    }

    const attempt =
      this.db.campaignPipeline.getStage(run.id, stage)?.attempt ?? 1;
    const key = buildStageIdempotencyKey({
      campaignId,
      projectId,
      stage,
      startToken: run.start_token,
      attempt,
    });
    const row = this.db.campaignPipeline.ensureStage({
      runId: run.id,
      stage,
      idempotencyKey: key,
      attempt,
    });
    this.db.campaignPipeline.updateStage(row.id, {
      status: 'SKIPPED',
      finishedAt: utcNow(),
      checkpointJson: JSON.stringify({ message: 'Skipped by policy/operator' }),
    });

    const next = nextPipelineStage(stage);
    this.db.campaignPipeline.updateRun(run.id, {
      currentStage: next ?? stage,
      status: next ? 'RUNNING' : 'COMPLETED',
    });
  }

  restartFromStage(
    campaignId: string,
    projectId: string,
    stage: CampaignPipelineStage,
  ): void {
    const campaign = this.db.translationCampaigns.getById(campaignId);
    if (!campaign?.start_token) throw new Error('Campaign has no start token');
    const run = this.db.campaignPipeline.getRunByFingerprint(
      campaignId,
      projectId,
      campaign.start_token,
    );
    if (!run) throw new Error('Pipeline run not found');

    const startIdx = CAMPAIGN_PIPELINE_STAGES.indexOf(stage);
    for (const s of CAMPAIGN_PIPELINE_STAGES.slice(startIdx)) {
      const existing = this.db.campaignPipeline.getStage(run.id, s);
      if (!existing) continue;
      // Keep side effects for TRANSLATION so enqueue stays once.
      const keepEffects =
        s === 'TRANSLATION'
          ? existing.side_effects_json
          : s === 'DELIVERY'
            ? existing.side_effects_json
            : null;
      const nextAttempt = existing.attempt + 1;
      const key = buildStageIdempotencyKey({
        campaignId,
        projectId,
        stage: s,
        startToken: run.start_token,
        attempt: nextAttempt,
      });
      this.db.campaignPipeline.updateStage(existing.id, {
        status: 'PENDING',
        attempt: nextAttempt,
        idempotencyKey: key,
        outputJson: null,
        checkpointJson:
          s === 'TRANSLATION' ? existing.checkpoint_json : null,
        sideEffectsJson: keepEffects,
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
        startedAt: null,
      });
    }

    this.db.campaignPipeline.updateRun(run.id, {
      currentStage: stage,
      status: 'RUNNING',
      errorCode: null,
      errorMessage: null,
    });
    this.db.translationCampaigns.updateProject(campaignId, projectId, {
      status: 'RUNNING',
      blockerCode: null,
    });
    this.db.translationCampaigns.updateCampaign(campaignId, {
      status: 'RUNNING',
      completedAt: null,
    });
  }

  pauseRuns(campaignId: string): void {
    for (const run of this.db.campaignPipeline.listRunsByCampaign(campaignId)) {
      if (PIPELINE_TERMINAL_RUN_STATUSES.has(run.status)) continue;
      this.db.campaignPipeline.updateRun(run.id, { status: 'PAUSED' });
    }
  }

  resumeRuns(campaignId: string): void {
    for (const run of this.db.campaignPipeline.listRunsByCampaign(campaignId)) {
      if (run.status === 'PAUSED' || run.status === 'FAILED_RETRYABLE') {
        this.db.campaignPipeline.updateRun(run.id, { status: 'RUNNING' });
      }
    }
  }

  cancelRuns(campaignId: string): void {
    for (const run of this.db.campaignPipeline.listRunsByCampaign(campaignId)) {
      if (PIPELINE_TERMINAL_RUN_STATUSES.has(run.status)) continue;
      this.db.campaignPipeline.updateRun(run.id, { status: 'CANCELLED' });
    }
  }

  reconcileCampaignStatus(campaignId: string): void {
    const campaign = this.db.translationCampaigns.getById(campaignId);
    if (!campaign) return;
    if (
      campaign.status === 'CANCELLED' ||
      campaign.status === 'PAUSED' ||
      campaign.status === 'DRAFT'
    ) {
      return;
    }

    const runs = this.db.campaignPipeline.listRunsByCampaign(campaignId);
    if (runs.length === 0) return;

    const allTerminal = runs.every((r) =>
      PIPELINE_TERMINAL_RUN_STATUSES.has(r.status),
    );
    if (!allTerminal) {
      if (campaign.status !== 'RUNNING' && campaign.status !== 'STARTING') {
        this.db.translationCampaigns.updateCampaign(campaignId, {
          status: 'RUNNING',
        });
      }
      return;
    }

    const prevStatus = campaign.status;
    const hasUnresolved = runs.some((r) =>
      PIPELINE_FAILURE_RUN_STATUSES.has(r.status),
    );
    const allCancelled = runs.every((r) => r.status === 'CANCELLED');
    if (allCancelled) {
      this.db.translationCampaigns.updateCampaign(campaignId, {
        status: 'CANCELLED',
        completedAt: utcNow(),
      });
      return;
    }
    if (hasUnresolved) {
      this.db.translationCampaigns.updateCampaign(campaignId, {
        status: 'PARTIAL_FAILED',
        completedAt: utcNow(),
        lastError: 'One or more projects failed or need attention',
      });
      if (prevStatus !== 'PARTIAL_FAILED') {
        emitProductionCompletion(
          buildCampaignCompletionEvent({
            campaignId,
            kind: 'CAMPAIGN_NEEDS_ATTENTION',
            title: 'Chiến dịch cần chú ý',
            description:
              campaign.title?.trim() ||
              'Một hoặc nhiều dự án thất bại / cần xử lý',
          }),
        );
      }
      return;
    }

    this.db.translationCampaigns.updateCampaign(campaignId, {
      status: 'COMPLETED',
      completedAt: utcNow(),
      lastError: null,
    });
    if (prevStatus !== 'COMPLETED') {
      emitProductionCompletion(
        buildCampaignCompletionEvent({
          campaignId,
          kind: 'CAMPAIGN_COMPLETED',
          title: 'Chiến dịch hoàn tất',
          description: campaign.title?.trim() || 'Tất cả dự án đã giao',
        }),
      );
    }
  }

  private resolveRecipeConfig(snapshotJson: string): TranslationRecipeConfig {
    try {
      const snap = JSON.parse(snapshotJson) as {
        config?: TranslationRecipeConfig;
      };
      if (snap.config) {
        return TranslationRecipeConfigSchema.parse(snap.config);
      }
    } catch {
      /* fall through */
    }
    return TranslationRecipeConfigSchema.parse({
      configVersion: 1,
      mode: 'BALANCED',
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
      exportFormatHints: [],
    });
  }
}

let singleton: CampaignPipelineOrchestrator | null = null;

export function getCampaignPipelineOrchestrator(
  db?: DatabaseManager,
  options?: CampaignPipelineOrchestratorOptions,
): CampaignPipelineOrchestrator {
  if (options || !singleton) {
    singleton = new CampaignPipelineOrchestrator(
      db ?? getDatabase(),
      options ?? { skipBrowser: false },
    );
  }
  return singleton;
}

export function resetCampaignPipelineOrchestratorForTests(): void {
  singleton = null;
}
