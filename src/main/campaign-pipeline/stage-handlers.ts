import type { DatabaseManager } from '../db/database-manager';
import type { CampaignPipelineStageRow } from '../db/repositories/campaign-pipeline-repository';
import type { TranslationRecipeConfig } from '@shared/constants/translation-recipe-defs';
import type { TranslationRecipeMode } from '@shared/constants/translation-recipes';
import type {
  CampaignPipelineCheckpoint,
  CampaignPipelineSideEffects,
  CampaignPipelineStageOutput,
} from '@shared/schemas/campaign-pipeline';
import type { CampaignPipelineStage } from '@shared/constants/campaign-pipeline';
import { JOB_TERMINAL_STATES } from '@shared/constants/job';
import { getJobService } from '../services/job-service-singleton';
import { runDeliveryAutoExport } from '../portability/delivery-export-service';
import { emitProductionCompletion } from '../production/completion-notify-bridge';

export interface StageHandlerContext {
  db: DatabaseManager;
  campaignId: string;
  projectId: string;
  runId: string;
  stage: CampaignPipelineStage;
  recipeMode: TranslationRecipeMode;
  recipeConfig: TranslationRecipeConfig;
  startToken: string;
  attempt: number;
  stageRow: CampaignPipelineStageRow;
  /** Test hook: throw after recording a named side effect. */
  crashAfterSideEffect?: string | null;
  /** Skip live bootstrap / provider (unit tests). */
  skipBrowser?: boolean;
  /** Optional account change mid-pipeline. */
  preferredAccountId?: string | null;
}

export type StageHandler = (
  ctx: StageHandlerContext,
) => Promise<CampaignPipelineStageOutput>;

function mergeEffects(
  existing: CampaignPipelineSideEffects,
  next: CampaignPipelineSideEffects,
): CampaignPipelineSideEffects {
  return { ...existing, ...next };
}

function countHumanLocked(db: DatabaseManager, projectId: string): number {
  const project = db.projects.getById(projectId);
  const editionId = project?.active_edition_id;
  let locked = 0;
  for (const ch of db.chapters.listByProject(projectId)) {
    for (const para of db.paragraphs.listByChapter(ch.id)) {
      const tr = db.translations.getByParagraphId(para.id, editionId);
      if (tr?.human_locked === 1) locked += 1;
    }
  }
  return locked;
}

function translationJobTerminal(db: DatabaseManager, jobIds: string[]): {
  allTerminal: boolean;
  failed: number;
  needsAttention: number;
  completed: number;
} {
  let failed = 0;
  let needsAttention = 0;
  let completed = 0;
  let pending = 0;
  for (const id of jobIds) {
    const job = db.jobs.getById(id);
    if (!job) {
      failed += 1;
      continue;
    }
    if (job.state === 'NEEDS_ATTENTION') {
      needsAttention += 1;
      continue;
    }
    if (JOB_TERMINAL_STATES.has(job.state as import('@shared/constants/job').JobState)) {
      if (job.state === 'COMPLETED' || job.state === 'CANCELLED') {
        completed += 1;
      } else {
        failed += 1;
      }
      continue;
    }
    pending += 1;
  }
  return {
    allTerminal: pending === 0,
    failed,
    needsAttention,
    completed,
  };
}

export const handleIntake: StageHandler = async (ctx) => {
  const project = ctx.db.projects.getById(ctx.projectId);
  if (!project || project.deleted_at) {
    return {
      status: 'FAILED_FINAL',
      errorCode: 'PROJECT_MISSING',
      errorMessage: 'Project missing',
    };
  }
  const chapters = ctx.db.chapters
    .listByProject(ctx.projectId)
    .filter((c) => c.chapter_number != null && c.chapter_number > 0);
  if (chapters.length === 0) {
    return {
      status: 'FAILED_FINAL',
      errorCode: 'NO_CHAPTERS',
      errorMessage: 'No chapters',
    };
  }
  return {
    status: 'COMPLETED',
    checkpoint: {
      message: 'Intake ok',
      chaptersTotal: chapters.length,
      humanLockedCount: countHumanLocked(ctx.db, ctx.projectId),
    },
  };
};

export const handlePreflight: StageHandler = async (ctx) => {
  const project = ctx.db.projects.getById(ctx.projectId);
  if (!project) {
    return {
      status: 'FAILED_FINAL',
      errorCode: 'PROJECT_MISSING',
      errorMessage: 'Project missing',
    };
  }
  const chapters = ctx.db.chapters.listByProject(ctx.projectId);
  const sourceErrors = chapters.filter(
    (c) =>
      c.source_status === 'SOURCE_ERROR' ||
      c.source_status === 'SOURCE_MISSING' ||
      c.source_status === 'SOURCE_CONFLICT',
  );
  if (sourceErrors.length === chapters.length && chapters.length > 0) {
    return {
      status: 'NEEDS_ATTENTION',
      errorCode: 'SOURCE_ERROR',
      errorMessage: 'All chapters have source errors',
      checkpoint: { chaptersTotal: chapters.length },
    };
  }
  return {
    status: 'COMPLETED',
    checkpoint: {
      message: 'Preflight ok',
      chaptersTotal: chapters.length,
      humanLockedCount: countHumanLocked(ctx.db, ctx.projectId),
      accountId: ctx.preferredAccountId ?? null,
    },
  };
};

export const handleBootstrap: StageHandler = async (ctx) => {
  const existing = ctx.db.campaignPipeline.parseSideEffects(ctx.stageRow);
  if (existing.bootstrapPrepared) {
    return {
      status: 'COMPLETED',
      checkpoint: ctx.db.campaignPipeline.parseCheckpoint(ctx.stageRow),
      sideEffects: existing,
    };
  }

  // QUICK / SAFE: mark ready without deep browser bootstrap when skipBrowser.
  if (ctx.skipBrowser || ctx.recipeMode === 'QUICK') {
    const sideEffects = mergeEffects(existing, { bootstrapPrepared: true });
    if (ctx.crashAfterSideEffect === 'bootstrapPrepared') {
      // Persist side effect then throw — caller must save before rethrow.
      return {
        status: 'RUNNING',
        wait: true,
        sideEffects,
        checkpoint: { message: 'bootstrap side effect recorded' },
        errorCode: 'CRASH_SIM',
        errorMessage: 'crashAfterSideEffect:bootstrapPrepared',
      };
    }
    return {
      status: 'COMPLETED',
      sideEffects,
      checkpoint: {
        message:
          ctx.recipeMode === 'QUICK'
            ? 'QUICK bootstrap lightweight'
            : 'Bootstrap skipped (test)',
        accountId: ctx.preferredAccountId ?? null,
      },
    };
  }

  // BALANCED / PUBLICATION: readiness check only here; deep notebook work
  // still happens inside translate jobs. Record once.
  const sideEffects = mergeEffects(existing, { bootstrapPrepared: true });
  return {
    status: 'COMPLETED',
    sideEffects,
    checkpoint: {
      message: `${ctx.recipeMode} bootstrap checkpoint`,
      accountId: ctx.preferredAccountId ?? null,
      humanLockedCount: countHumanLocked(ctx.db, ctx.projectId),
    },
  };
};

export const handleTranslation: StageHandler = async (ctx) => {
  const existing = ctx.db.campaignPipeline.parseSideEffects(ctx.stageRow);
  const checkpoint = ctx.db.campaignPipeline.parseCheckpoint(ctx.stageRow);

  if (!existing.translationEnqueued) {
    const jobService = getJobService();
    const enqueued = jobService.enqueueTranslateNovel({
      projectId: ctx.projectId,
      skipTranslated: true,
      campaignId: ctx.campaignId,
    });

    const jobIds: string[] = [];
    for (const job of enqueued.jobs) {
      ctx.db.translationCampaigns.tryLinkJob({
        campaignId: ctx.campaignId,
        projectId: ctx.projectId,
        jobId: job.id,
        chapterFrom: job.chapterFrom ?? 0,
        chapterTo: job.chapterTo ?? 0,
      });
      jobIds.push(job.id);
    }

    const sideEffects = mergeEffects(existing, { translationEnqueued: true });
    const nextCheckpoint: CampaignPipelineCheckpoint = {
      ...checkpoint,
      message: 'Translation enqueued',
      jobIds,
      chaptersTotal: enqueued.jobs.length + enqueued.skippedCount,
      chaptersDone: enqueued.skippedCount,
      humanLockedCount: countHumanLocked(ctx.db, ctx.projectId),
      accountId: ctx.preferredAccountId ?? null,
    };

    if (ctx.crashAfterSideEffect === 'translationEnqueued') {
      return {
        status: 'RUNNING',
        wait: true,
        sideEffects,
        checkpoint: nextCheckpoint,
        errorCode: 'CRASH_SIM',
        errorMessage: 'crashAfterSideEffect:translationEnqueued',
      };
    }

    if (jobIds.length === 0) {
      return {
        status: 'COMPLETED',
        sideEffects,
        checkpoint: {
          ...nextCheckpoint,
          message: 'Nothing to translate (all done / skipped)',
        },
      };
    }

    return {
      status: 'RUNNING',
      wait: true,
      sideEffects,
      checkpoint: nextCheckpoint,
    };
  }

  const jobIds = checkpoint.jobIds ?? [];
  if (jobIds.length === 0) {
    return {
      status: 'COMPLETED',
      sideEffects: existing,
      checkpoint,
    };
  }

  const summary = translationJobTerminal(ctx.db, jobIds);
  if (!summary.allTerminal) {
    return {
      status: 'RUNNING',
      wait: true,
      sideEffects: existing,
      checkpoint: {
        ...checkpoint,
        chaptersDone: summary.completed,
        message: 'Waiting for translation jobs',
      },
    };
  }

  if (summary.needsAttention > 0) {
    return {
      status: 'NEEDS_ATTENTION',
      sideEffects: existing,
      errorCode: 'JOB_NEEDS_ATTENTION',
      errorMessage: `${summary.needsAttention} job(s) need attention`,
      checkpoint: { ...checkpoint, chaptersDone: summary.completed },
    };
  }
  if (summary.failed > 0 && summary.completed === 0) {
    return {
      status: 'FAILED_RETRYABLE',
      sideEffects: existing,
      errorCode: 'JOBS_FAILED',
      errorMessage: `${summary.failed} job(s) failed`,
      checkpoint: { ...checkpoint, chaptersDone: summary.completed },
    };
  }
  if (summary.failed > 0) {
    return {
      status: 'NEEDS_ATTENTION',
      sideEffects: existing,
      errorCode: 'PARTIAL_JOB_FAILURE',
      errorMessage: `${summary.failed} job(s) failed`,
      checkpoint: { ...checkpoint, chaptersDone: summary.completed },
    };
  }

  return {
    status: 'COMPLETED',
    sideEffects: existing,
    checkpoint: {
      ...checkpoint,
      chaptersDone: summary.completed,
      humanLockedCount: countHumanLocked(ctx.db, ctx.projectId),
      message: 'Translation complete',
    },
  };
};

export const handleQaRepair: StageHandler = async (ctx) => {
  const { getTranslationQaFindingsService } = await import(
    '../services/translation-qa-findings-service'
  );
  const findingsSvc = getTranslationQaFindingsService(ctx.db);
  const scan = findingsSvc.scanProjectPersisted({
    projectId: ctx.projectId,
    qaLevel: ctx.recipeConfig.qaLevel,
    campaignId: ctx.campaignId,
  });

  const humanLockedCount = countHumanLocked(ctx.db, ctx.projectId);
  const consistencySummary =
    ctx.recipeConfig.endOfBookConsistencyReport ||
    ctx.recipeMode === 'BALANCED' ||
    ctx.recipeMode === 'PUBLICATION'
      ? `mode=${ctx.recipeMode}; open=${scan.openCount}; attention=${scan.attention}; score=${scan.score.composite}; qa=${ctx.recipeConfig.qaLevel}`
      : undefined;

  if (scan.attention > 0 && ctx.recipeMode === 'PUBLICATION') {
    return {
      status: 'NEEDS_ATTENTION',
      errorCode: 'QA_ATTENTION',
      errorMessage: `${scan.attention} finding(s) in human_locked / attention`,
      checkpoint: {
        message: 'QA repair stage — attention required',
        chaptersTotal: ctx.db.chapters.listByProject(ctx.projectId).length,
        humanLockedCount,
        consistencySummary,
      },
    };
  }

  if (
    scan.qa.verdict === 'REPAIR_REQUIRED' &&
    scan.openCount > 0 &&
    ctx.recipeConfig.qaLevel === 'strict'
  ) {
    return {
      status: 'NEEDS_ATTENTION',
      errorCode: 'QA_OPEN_FINDINGS',
      errorMessage: `${scan.openCount} open QA finding(s)`,
      checkpoint: {
        message: 'Strict QA left open findings',
        humanLockedCount,
        consistencySummary,
      },
    };
  }

  return {
    status: 'COMPLETED',
    checkpoint: {
      message: 'QA/repair local scan complete',
      chaptersTotal: ctx.db.chapters.listByProject(ctx.projectId).length,
      humanLockedCount,
      consistencySummary,
    },
  };
};

export const handleWholeBookAudit: StageHandler = async (ctx) => {
  if (!ctx.recipeConfig.wholeBookAudit || ctx.recipeMode === 'QUICK') {
    return {
      status: 'SKIPPED',
      checkpoint: {
        auditSkippedReason:
          ctx.recipeMode === 'QUICK'
            ? 'QUICK skips deep whole-book audit'
            : 'Recipe wholeBookAudit=false',
      },
    };
  }

  // BALANCED: local consistency summary (no full publication audit).
  if (ctx.recipeMode === 'BALANCED' && !ctx.recipeConfig.wholeBookAudit) {
    return {
      status: 'COMPLETED',
      checkpoint: {
        message: 'BALANCED consistency summary',
        consistencySummary: 'standard end-of-book consistency',
        auditCriticalCount: 0,
        humanLockedCount: countHumanLocked(ctx.db, ctx.projectId),
      },
    };
  }

  const { getWholeBookAuditService } = await import(
    '../whole-book-audit/whole-book-audit-service'
  );
  const result = await getWholeBookAuditService(ctx.db).run({
    projectId: ctx.projectId,
    campaignId: ctx.campaignId,
    recipeMode: ctx.recipeMode,
    exportReport: true,
  });

  const humanLockedCount = countHumanLocked(ctx.db, ctx.projectId);
  if (result.status === 'NEEDS_ATTENTION') {
    const existing = ctx.db.campaignPipeline.parseSideEffects(ctx.stageRow);
    const sideEffects = mergeEffects(existing, { attentionNotified: true });
    return {
      status: 'NEEDS_ATTENTION',
      sideEffects,
      errorCode: 'AUDIT_CRITICAL',
      errorMessage: `${result.criticalCount} critical whole-book finding(s)`,
      checkpoint: {
        auditCriticalCount: result.criticalCount,
        humanLockedCount,
        message: 'Whole-book audit needs attention',
        consistencySummary: `findings=${result.findingsCount}; autoRepaired=${result.autoRepaired}`,
      },
    };
  }

  if (result.status === 'FAILED') {
    return {
      status: 'FAILED_RETRYABLE',
      errorCode: 'AUDIT_FAILED',
      errorMessage: 'Whole-book audit failed',
      checkpoint: { humanLockedCount },
    };
  }

  return {
    status: 'COMPLETED',
    checkpoint: {
      auditCriticalCount: result.criticalCount,
      message: 'Whole-book audit completed',
      humanLockedCount,
      consistencySummary: `findings=${result.findingsCount}; autoRepaired=${result.autoRepaired}; report=${result.reportHtmlPath ?? 'n/a'}`,
    },
  };
};

export const handleDelivery: StageHandler = async (ctx) => {
  const existing = ctx.db.campaignPipeline.parseSideEffects(ctx.stageRow);
  if (existing.deliveryExported && existing.completionNotified && existing.deliveryMarked) {
    return {
      status: 'COMPLETED',
      sideEffects: existing,
      checkpoint: ctx.db.campaignPipeline.parseCheckpoint(ctx.stageRow),
    };
  }

  // Unit / dry-run: no filesystem export or desktop notify.
  if (ctx.skipBrowser) {
    const sideEffects = mergeEffects(existing, {
      deliveryMarked: true,
      deliveryExported: true,
      deliveryExportFingerprint: `skipBrowser:${ctx.startToken}`,
      completionNotified: true,
    });
    if (ctx.crashAfterSideEffect === 'deliveryMarked') {
      return {
        status: 'RUNNING',
        wait: true,
        sideEffects,
        checkpoint: {
          deliveryReady: true,
          message: 'Delivery dry-run (skipBrowser)',
          humanLockedCount: countHumanLocked(ctx.db, ctx.projectId),
        },
        errorCode: 'CRASH_SIM',
        errorMessage: 'crashAfterSideEffect:deliveryMarked',
      };
    }
    return {
      status: 'COMPLETED',
      sideEffects,
      checkpoint: {
        deliveryReady: true,
        message: 'Delivery dry-run (skipBrowser)',
        humanLockedCount: countHumanLocked(ctx.db, ctx.projectId),
      },
    };
  }

  const startedAt = ctx.stageRow.started_at ?? null;

  const result = await runDeliveryAutoExport({
    db: ctx.db,
    campaignId: ctx.campaignId,
    projectId: ctx.projectId,
    runId: ctx.runId,
    startToken: ctx.startToken,
    recipeMode: ctx.recipeMode,
    recipeConfig: ctx.recipeConfig,
    existingEffects: existing,
    startedAt,
  });

  if (ctx.crashAfterSideEffect === 'deliveryMarked') {
    return {
      status: 'RUNNING',
      wait: true,
      sideEffects: mergeEffects(result.sideEffects, { deliveryMarked: true }),
      checkpoint: result.checkpoint,
      errorCode: 'CRASH_SIM',
      errorMessage: 'crashAfterSideEffect:deliveryMarked',
    };
  }

  if (!result.sideEffects.deliveryExported) {
    return {
      status: 'FAILED_RETRYABLE',
      sideEffects: mergeEffects(result.sideEffects, { deliveryMarked: true }),
      checkpoint: result.checkpoint,
      errorCode: 'DELIVERY_EXPORT_FAILED',
      errorMessage: result.checkpoint.message ?? 'Delivery export failed',
    };
  }

  let sideEffects = mergeEffects(result.sideEffects, { deliveryMarked: true });
  if (result.event && !sideEffects.completionNotified) {
    emitProductionCompletion(result.event);
    sideEffects = mergeEffects(sideEffects, { completionNotified: true });
  }

  return {
    status: 'COMPLETED',
    sideEffects,
    checkpoint: {
      ...result.checkpoint,
      humanLockedCount: countHumanLocked(ctx.db, ctx.projectId),
    },
  };
};

export const STAGE_HANDLERS: Record<CampaignPipelineStage, StageHandler> = {
  INTAKE: handleIntake,
  PREFLIGHT: handlePreflight,
  BOOTSTRAP: handleBootstrap,
  TRANSLATION: handleTranslation,
  QA_REPAIR: handleQaRepair,
  WHOLE_BOOK_AUDIT: handleWholeBookAudit,
  DELIVERY: handleDelivery,
};
