import type { DatabaseManager } from '../db/database-manager';
import {
  runRepairLoop,
  recoverCrashedAttempts,
  hashPrompt,
  type RepairSender,
} from '../jobs/repair-loop';
import type { RepairParagraph } from '../jobs/repair-strategies';
import type { LockedTermForQa } from '../jobs/qa-checker';
import type {
  JobAttemptDto,
  JobDto,
  RepairLoopResult,
} from '@shared/schemas/job';
import { isPackModeOrLegacy, normalizePackMode } from '@shared/constants/pack-mode';
import type { AttentionAction, WorkerMode } from '@shared/constants/job';
import {
  ATTENTION_ACTIONS,
  DEFAULT_MAX_CHAPTERS_PER_JOB,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  DEFAULT_MAX_CONCURRENT_WORKERS,
} from '@shared/constants/job';
import {
  planChapterBatches,
  historyFromProjectStats,
  type ChapterBatchInput,
} from '../jobs/batch-sizer';
import { resolveAutoMaxChaptersPerJob } from '../jobs/auto-throughput-policy';
import type { JobAttemptRow, JobRow } from '../db/repositories/job-repository';
import type { AutomationScheduler } from '../jobs/scheduler';
import { healIdleWorkers } from '../jobs/heal-workers';
import { saveConcurrencyPolicy } from '../jobs/concurrency-policy';
import { isParallelWavesEnabled, setParallelWavesEnabled } from '../jobs/wave-service';
import { resolveActiveEditionId } from './edition-service';
import { resolveForProjectEdition } from './translation-language-resolver';
import {
  buildRepairTranslationContext,
  repairContextSnapshot,
} from '../jobs/repair-translation-context';
import { logger } from '../logging/logger';
import { isAiSoftErrorText } from '@shared/utils/provider-response-classifier';
import { QaResultSchema, ParsedBatchResultSchema } from '@shared/schemas/output-protocol';
import {
  PARALLEL_WAVES_UI_WARNING_VI,
} from '@shared/constants/parallel-waves';
import { assertKhepreeProductAccess } from '../khepree/product-access-boundary';

export interface CreateRepairJobInput {
  projectId: string;
  accountId?: string | null;
  batchParagraphs: RepairParagraph[];
  sourceParagraphIds: string[];
  initialRawResponse: string;
  initialPrompt?: string;
  maxRepairAttempts?: number;
  lockedTerms?: LockedTermForQa[];
}

export interface EnqueueTranslateJobInput {
  projectId: string;
  chapterFrom: number;
  chapterTo: number;
  priority?: number;
  workerMode?: WorkerMode;
  pinnedAccountId?: string | null;
  sourceParagraphIds: string[];
  batchParagraphs: RepairParagraph[];
  maxRepairAttempts?: number;
  maxContinuationAttempts?: number;
  lockedTerms?: LockedTermForQa[];
  chapterIds?: string[];
  batchDecisionId?: string | null;
}

export interface EnqueueTranslateNovelInput {
  projectId: string;
  chapterFrom?: number;
  chapterTo?: number;
  /** When set, only these chapter UUIDs (still SOURCE_READY + skip logic). */
  chapterIds?: string[];
  /** User cap — engine may shrink batch when source is large. Default 3. */
  maxChaptersPerJob?: number;
  /** Default true — skip chapters with no remaining paragraphs to translate. */
  skipTranslated?: boolean;
  priority?: number;
  workerMode?: WorkerMode;
  pinnedAccountId?: string | null;
  maxRepairAttempts?: number;
  maxContinuationAttempts?: number;
}

export class JobService {
  private scheduler: AutomationScheduler | null = null;

  constructor(private readonly db: DatabaseManager) {}

  attachScheduler(scheduler: AutomationScheduler): void {
    this.scheduler = scheduler;
  }

  list(projectId?: string): JobDto[] {
    const rows = projectId
      ? this.db.jobs.listByProject(projectId)
      : this.db.jobs.listAll();
    return rows.map((row) => this.toJobDto(row));
  }

  get(jobId: string): { job: JobDto; attempts: JobAttemptDto[] } {
    const row = this.db.jobs.getById(jobId);
    if (!row) throw new Error(`Job not found: ${jobId}`);
    return {
      job: this.toJobDto(row),
      attempts: this.db.jobs.listAttempts(jobId).map(toAttemptDto),
    };
  }

  /**
   * Enqueue one durable translation job for the chapter (or range).
   * Large chapters are chunked under the hood during send — not as separate jobs.
   */
  enqueueTranslate(input: EnqueueTranslateJobInput): { job: JobDto; jobs: JobDto[] } {
    assertKhepreeProductAccess();
    healIdleWorkers(this.db);
    const dto = this.createTranslateJob(input);
    void this.prepareProfilesAndKickScheduler();
    return { job: dto, jobs: [dto] };
  }

  /**
   * Enqueue one job per eligible chapter (SOURCE_READY, optional range).
   * Scheduler runs them by priority (sequence order) — not one mega-job.
   */
  enqueueTranslateNovel(input: EnqueueTranslateNovelInput): {
    jobs: JobDto[];
    queuedCount: number;
    skippedCount: number;
  } {
    assertKhepreeProductAccess();
    if (
      input.chapterFrom != null &&
      input.chapterTo != null &&
      input.chapterTo < input.chapterFrom
    ) {
      throw new Error('chapterTo must be >= chapterFrom');
    }
    if (input.workerMode === 'PINNED' && !input.pinnedAccountId) {
      throw new Error('PINNED mode requires pinnedAccountId');
    }
    if (!this.db.projects.getById(input.projectId)) {
      throw new Error(`Project not found: ${input.projectId}`);
    }

    const skipTranslated = input.skipTranslated !== false;
    healIdleWorkers(this.db);
    const editionId = resolveActiveEditionId(this.db, input.projectId);

    const idFilter =
      input.chapterIds && input.chapterIds.length > 0
        ? new Set(input.chapterIds)
        : null;

    const chapters = this.db.chapters
      .listByProject(input.projectId)
      .filter((ch) => ch.source_status === 'SOURCE_READY')
      .filter((ch) => (idFilter ? idFilter.has(ch.id) : true))
      .sort((a, b) => a.sequence_order - b.sequence_order);

    const jobs: JobDto[] = [];
    let skippedCount = 0;
    const eligible: ChapterBatchInput[] = [];

    // chapterIds that were requested but not SOURCE_READY / missing count as skipped
    if (idFilter) {
      const found = new Set(chapters.map((c) => c.id));
      for (const id of idFilter) {
        if (!found.has(id)) skippedCount += 1;
      }
    }

    for (const chapter of chapters) {
      const ref = chapter.chapter_number ?? chapter.sequence_order;
      if (!idFilter) {
        if (input.chapterFrom != null && ref < input.chapterFrom) {
          skippedCount += 1;
          continue;
        }
        if (input.chapterTo != null && ref > input.chapterTo) {
          skippedCount += 1;
          continue;
        }
      }

      const paragraphs = this.db.paragraphs.listByChapter(chapter.id);
      const batchParagraphs = paragraphs
        .filter((p) => {
          const translation = this.db.translations.getByParagraphId(p.id, editionId);
          if (translation?.human_locked === 1 && translation.translated_text?.trim()) {
            return false;
          }
          if (skipTranslated && translation?.translated_text?.trim()) {
            return false;
          }
          return true;
        })
        .map((p) => ({
          paragraphId: p.paragraph_id,
          sourceText: p.source_text,
        }));

      if (batchParagraphs.length === 0) {
        skippedCount += 1;
        continue;
      }

      eligible.push({
        chapterId: chapter.id,
        chapterRef: ref,
        batchParagraphs,
      });
    }

    const providerType = this.db.aiProviders.listEnabledOrdered()[0]?.type ?? null;
    const stats = this.db.batchSize.getProjectStats(input.projectId);
    const history = historyFromProjectStats(stats);
    const maxChaptersUser =
      input.maxChaptersPerJob ??
      resolveAutoMaxChaptersPerJob(providerType, history);
    const batchPlans = planChapterBatches(eligible, {
      maxChaptersUser,
      providerType,
      history,
    });

    for (const plan of batchPlans) {
      const batchParagraphs = plan.chapters.flatMap((c) => c.batchParagraphs);
      const chapterIds = plan.chapters.map((c) => c.chapterId);
      const refs = plan.chapters.map((c) => c.chapterRef);
      const chapterFrom = Math.min(...refs);
      const chapterTo = Math.max(...refs);

      const decision = this.db.batchSize.insertDecision({
        project_id: input.projectId,
        user_max_chapters: plan.userMaxChapters,
        chosen_chapters: plan.chosenChapterCount,
        source_characters: plan.sourceCharacters,
        paragraph_count: plan.paragraphCount,
        provider_type: providerType,
        reason: plan.reason,
      });

      const job = this.createTranslateJob({
        projectId: input.projectId,
        chapterFrom,
        chapterTo,
        priority: input.priority ?? chapterFrom,
        workerMode: input.workerMode,
        pinnedAccountId: input.pinnedAccountId,
        sourceParagraphIds: batchParagraphs.map((p) => p.paragraphId),
        batchParagraphs,
        maxRepairAttempts: input.maxRepairAttempts,
        maxContinuationAttempts: input.maxContinuationAttempts,
        chapterIds,
        batchDecisionId: decision.id,
      });
      this.db.batchSize.linkDecisionToJob(decision.id, job.id);
      jobs.push(job);
    }

    if (jobs.length > 0) {
      void this.prepareProfilesAndKickScheduler();
    }

    return {
      jobs,
      queuedCount: jobs.length,
      skippedCount,
    };
  }

  private createTranslateJob(input: EnqueueTranslateJobInput): JobDto {
    if (input.chapterTo < input.chapterFrom) {
      throw new Error('chapterTo must be >= chapterFrom');
    }
    if (input.workerMode === 'PINNED' && !input.pinnedAccountId) {
      throw new Error('PINNED mode requires pinnedAccountId');
    }

    const config = {
      sourceParagraphIds: input.sourceParagraphIds,
      batchParagraphs: input.batchParagraphs,
      maxRepairAttempts: input.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS,
      maxContinuationAttempts: input.maxContinuationAttempts,
      lockedTerms: input.lockedTerms ?? [],
      chapterIds: input.chapterIds,
      batchDecisionId: input.batchDecisionId ?? null,
    };
    const job = this.db.jobs.create({
      project_id: input.projectId,
      type: 'translate_batch',
      state: 'QUEUED',
      priority: input.priority ?? 100,
      chapter_from: input.chapterFrom,
      chapter_to: input.chapterTo,
      worker_mode: input.workerMode ?? 'POOL',
      pinned_account_id: input.pinnedAccountId ?? null,
      config: JSON.stringify(config),
      edition_id: resolveActiveEditionId(this.db, input.projectId),
    });
    return this.toJobDto(job);
  }

  moveJob(jobId: string, priority: number): JobDto {
    const row = this.db.jobs.setPriority(jobId, priority);
    if (!row) throw new Error(`Job not found: ${jobId}`);
    return this.toJobDto(row);
  }

  changeWorker(
    jobId: string,
    workerMode: WorkerMode,
    pinnedAccountId?: string | null,
  ): JobDto {
    if (workerMode === 'PINNED' && !pinnedAccountId) {
      throw new Error('PINNED mode requires pinnedAccountId');
    }
    const row = this.db.jobs.setPinnedAccount(
      jobId,
      pinnedAccountId ?? null,
      workerMode,
    );
    if (!row) throw new Error(`Job not found: ${jobId}`);
    return this.toJobDto(row);
  }

  cancelJob(jobId: string): JobDto {
    const row = this.db.jobs.updateState(jobId, 'CANCELLED', 'Cancelled by user');
    if (!row) throw new Error(`Job not found: ${jobId}`);
    this.db.jobs.releaseLease(jobId);
    return this.toJobDto(row);
  }

  retryFailed(jobId: string): JobDto {
    const before = this.db.jobs.getById(jobId);
    if (!before) throw new Error(`Job not found: ${jobId}`);

    const row = this.db.jobs.requeueFailed(jobId);
    if (row?.state !== 'QUEUED') {
      throw new Error(
        `Job cannot be retried (state=${before.state}; need FAILED/NEEDS_ATTENTION/CANCELLED/SKIPPED)`,
      );
    }
    // Already queued before this call — treat as success (idempotent).
    return this.toJobDto(row);
  }

  /**
   * Bulk cancel / delete / retry. Partial success allowed.
   * Delete: cancel active jobs first, then remove rows (attempts CASCADE).
   */
  bulkJobs(
    jobIds: string[],
    action: 'cancel' | 'delete' | 'retry',
  ): {
    action: 'cancel' | 'delete' | 'retry';
    affected: number;
    skipped: number;
    failed: { jobId: string; error: string }[];
    message: string;
  } {
    const unique = [...new Set(jobIds)];
    let affected = 0;
    let skipped = 0;
    const failed: { jobId: string; error: string }[] = [];

    const terminal = new Set([
      'COMPLETED',
      'ACCEPTED_WITH_WARNINGS',
      'FAILED',
      'CANCELLED',
      'SKIPPED',
    ]);

    for (const jobId of unique) {
      try {
        const row = this.db.jobs.getById(jobId);
        if (!row) {
          failed.push({ jobId, error: 'Job not found' });
          continue;
        }

        if (action === 'cancel') {
          if (terminal.has(row.state) && row.state !== 'FAILED') {
            skipped += 1;
            continue;
          }
          if (row.state === 'CANCELLED') {
            skipped += 1;
            continue;
          }
          this.cancelJob(jobId);
          affected += 1;
          continue;
        }

        if (action === 'retry') {
          const before = this.db.jobs.getById(jobId);
          if (
            before &&
            !['FAILED', 'NEEDS_ATTENTION', 'CANCELLED', 'SKIPPED', 'QUEUED'].includes(
              before.state,
            )
          ) {
            skipped += 1;
            continue;
          }
          this.retryFailed(jobId);
          affected += 1;
          continue;
        }

        // delete
        if (!terminal.has(row.state)) {
          this.cancelJob(jobId);
        }
        const ok = this.db.jobs.delete(jobId);
        if (!ok) {
          failed.push({ jobId, error: 'Delete failed' });
          continue;
        }
        affected += 1;
      } catch (err) {
        failed.push({
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const message =
      action === 'cancel'
        ? `Đã hủy ${affected} tiến trình` +
          (skipped ? `, bỏ qua ${skipped}` : '') +
          (failed.length ? `, lỗi ${failed.length}` : '')
        : action === 'retry'
          ? `Đã xếp lại ${affected} tiến trình` +
            (failed.length ? `, lỗi ${failed.length}` : '')
          : `Đã xóa ${affected} tiến trình` +
            (failed.length ? `, lỗi ${failed.length}` : '');

    return { action, affected, skipped, failed, message };
  }

  pauseAll(): { affected: number } {
    const affected = this.scheduler?.pauseAll() ?? this.db.jobs.pauseAllQueued();
    return { affected };
  }

  pauseAllForLicensing(reason: string): { affected: number } {
    const licensingReason = `khepree:${reason}`;
    const affected =
      this.scheduler?.pauseAll(licensingReason) ?? this.db.jobs.pauseAllQueued(licensingReason);
    return { affected };
  }

  resumeAll(): { affected: number } {
    const affected = this.scheduler?.resumeAll() ?? this.db.jobs.resumeAllPaused();
    return { affected };
  }

  schedulerStatus(): {
    running: boolean;
    paused: boolean;
    inFlight: number;
    maxConcurrent: number;
    globalMaxMode: 'AUTO' | number;
    autoCap: number;
    perProjectMax: number;
    perProviderMax: number;
    perAccountPlaywrightMax: number;
    perAccountWebApiMax: number;
    allowSameProjectParallel: boolean;
    parallelTranslationWaves: boolean;
    parallelWavesWarning: string;
  } {
    const policy = this.scheduler?.getConcurrencyPolicy();
    const maxConcurrent =
      this.scheduler?.getEffectiveMaxConcurrent() ?? DEFAULT_MAX_CONCURRENT_WORKERS;
    const parallelTranslationWaves = isParallelWavesEnabled(this.db);
    return {
      running: this.scheduler?.isRunning() ?? false,
      paused: this.scheduler?.isPaused() ?? false,
      inFlight: this.scheduler?.getInFlightCount() ?? 0,
      maxConcurrent,
      globalMaxMode: policy?.globalMaxWorkers ?? 'AUTO',
      autoCap: policy?.autoCap ?? 3,
      perProjectMax: policy?.perProjectMax ?? 1,
      perProviderMax: policy?.perProviderMax ?? 3,
      perAccountPlaywrightMax: policy?.perAccountMax.playwright ?? 1,
      perAccountWebApiMax: policy?.perAccountMax.webApi ?? 1,
      allowSameProjectParallel: policy?.allowSameProjectParallel ?? false,
      parallelTranslationWaves,
      parallelWavesWarning: PARALLEL_WAVES_UI_WARNING_VI,
    };
  }

  updateSchedulerSettings(input: {
    globalMaxWorkers?: 'AUTO' | number;
    autoCap?: number;
    perProviderMax?: number;
    perAccountPlaywrightMax?: number;
    perAccountWebApiMax?: number;
  }): ReturnType<JobService['schedulerStatus']> {
    setParallelWavesEnabled(this.db, false);
    const patch = {
      ...input,
      perProjectMax: 1 as const,
      allowSameProjectParallel: false as const,
      perAccountPlaywrightMax: 1 as const,
      perAccountWebApiMax: 1 as const,
    };
    if (this.scheduler) {
      this.scheduler.updateConcurrencyPolicy(patch);
    } else {
      saveConcurrencyPolicy(this.db, patch);
    }
    return this.schedulerStatus();
  }

  listWorkers(): {
    id: string;
    accountId: string;
    health: string;
    priority: number;
    currentJobId: string | null;
    limitedUntil: string | null;
    lastError: string | null;
  }[] {
    // Heal workers stuck BUSY / NEEDS_ATTENTION after crashed jobs or resolved login.
    healIdleWorkers(this.db);

    return this.db.workerStates.listAll().map((w) => ({
      id: w.id,
      accountId: w.google_account_id,
      health: w.health,
      priority: w.priority,
      currentJobId: w.current_job_id,
      limitedUntil: w.limited_until,
      lastError: w.last_error,
    }));
  }

  /**
   * Close Account/Notebook browsers that hold profile locks, then claim ASAP.
   * Playwright translate and Web API path both need an unlocked READY worker.
   */
  private async prepareProfilesAndKickScheduler(): Promise<void> {
    try {
      const { getAccountWorkerService } = await import('./account-worker-singleton');
      const aws = getAccountWorkerService();
      for (const w of this.db.workerStates.listEnabled()) {
        if (w.health === 'DISABLED' || w.health === 'OFFLINE') continue;
        try {
          await aws.closeBrowser(w.google_account_id);
        } catch (error) {
          logger.warn('Could not release account browser before translate', {
            accountId: w.google_account_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      logger.warn('AccountWorker unavailable while preparing translate', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    healIdleWorkers(this.db);
    if (this.scheduler?.isRunning() && !this.scheduler.isPaused()) {
      this.scheduler.tick();
    }
  }

  /**
   * Create job + run automatic repair loop from an already-captured AI response.
   * `sendRepair` is injected (Gemini in prod, mock in tests).
   */
  async runFromRawResponse(
    input: CreateRepairJobInput,
    sendRepair: RepairSender,
  ): Promise<RepairLoopResult> {
    const maxRepairAttempts = input.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
    const config = {
      accountId: input.accountId ?? null,
      sourceParagraphIds: input.sourceParagraphIds,
      batchParagraphs: input.batchParagraphs,
      maxRepairAttempts,
      lockedTerms: input.lockedTerms ?? [],
      initialPromptHash: input.initialPrompt
        ? hashPrompt(input.initialPrompt)
        : null,
    };

    const job = this.db.jobs.create({
      project_id: input.projectId,
      type: 'translate_batch_repair',
      state: 'QUEUED',
      worker_id: null,
      config: JSON.stringify(config),
    });

    this.db.jobs.updateState(job.id, 'RUNNING');

    const pair = resolveForProjectEdition(this.db, {
      projectId: input.projectId,
    });
    this.db.jobs.updateProgress(
      job.id,
      JSON.stringify(
        repairContextSnapshot(
          buildRepairTranslationContext({
            projectId: input.projectId,
            editionId: pair.editionId,
            sourceLanguage: pair.sourceLanguage,
            targetLanguage: pair.targetLanguage,
            stylePolicyHash: input.initialPrompt
              ? hashPrompt(input.initialPrompt)
              : hashPrompt(input.initialRawResponse),
            knowledgeVersion: null,
            lockedTerms: input.lockedTerms ?? [],
          }),
        ),
      ),
    );

    return runRepairLoop(
      {
        jobId: job.id,
        projectId: input.projectId,
        batchParagraphs: input.batchParagraphs,
        sourceParagraphIds: input.sourceParagraphIds,
        initialRawResponse: input.initialRawResponse,
        initialInputRef: input.initialPrompt
          ? `prompt:${hashPrompt(input.initialPrompt)}`
          : `raw:${hashPrompt(input.initialRawResponse)}`,
        maxRepairAttempts,
        lockedTerms: input.lockedTerms,
        sendRepair,
      },
      { db: this.db },
    );
  }

  /** Resume after crash: recover attempts then optional user retry. */
  recover(jobId: string): { crashed: number; job: JobDto } {
    const row = this.db.jobs.getById(jobId);
    if (!row) throw new Error(`Job not found: ${jobId}`);
    const crashed = recoverCrashedAttempts(this.db, jobId);
    if (crashed > 0 && row.state === 'RUNNING') {
      this.db.jobs.markNeedsAttention(
        jobId,
        'CRASH_RECOVERY',
        `Recovered ${crashed} interrupted attempt(s)`,
      );
    }
    const updated = this.db.jobs.getById(jobId);
    if (!updated) throw new Error(`Job not found after recover: ${jobId}`);
    return { crashed, job: this.toJobDto(updated) };
  }

  async applyAttentionAction(
    jobId: string,
    action: AttentionAction,
    note?: string,
    sendRepair?: RepairSender,
  ): Promise<{ job: JobDto; message: string; loop?: RepairLoopResult }> {
    const row = this.db.jobs.getById(jobId);
    if (!row) throw new Error(`Job not found: ${jobId}`);

    const requireJob = (): JobDto => {
      const latest = this.db.jobs.getById(jobId);
      if (!latest) throw new Error(`Job not found: ${jobId}`);
      return this.toJobDto(latest);
    };

    switch (action) {
      case 'skip':
        this.db.jobs.updateState(jobId, 'SKIPPED', note ?? 'Skipped by user');
        return { job: requireJob(), message: 'Job skipped' };

      case 'manual_fix':
        this.db.jobs.markNeedsAttention(
          jobId,
          'MANUAL_FIX',
          note ?? 'Awaiting manual fix',
        );
        return {
          job: requireJob(),
          message: 'Marked for manual fix',
        };

      case 'accept_with_warning':
        this.db.jobs.updateState(
          jobId,
          'ACCEPTED_WITH_WARNINGS',
          note ?? 'Accepted with warnings',
        );
        return {
          job: requireJob(),
          message: 'Accepted with warnings',
        };

      case 'retry': {
        if (!sendRepair) {
          // No repair sender — full requeue (scheduler runs job again).
          return {
            job: this.retryFailed(jobId),
            message: 'Job requeued',
          };
        }
        const config = parseConfig(row.config);
        const progress = parseProgress(row.progress);
        const providerType =
          typeof progress.providerType === 'string' ? progress.providerType : undefined;
        const lastRaw = findLastOutput(this.db.jobs.listAttempts(jobId));
        // Soft-error / empty output: repair-from-last-output just fails again → requeue fresh.
        if (!lastRaw || isAiSoftErrorText(lastRaw, providerType)) {
          return {
            job: this.retryFailed(jobId),
            message: 'Job requeued',
          };
        }
        this.db.jobs.updateState(jobId, 'RUNNING');
        const loop = await runRepairLoop(
          {
            jobId,
            projectId: row.project_id,
            batchParagraphs: config.batchParagraphs,
            sourceParagraphIds: config.sourceParagraphIds,
            initialRawResponse: lastRaw,
            initialInputRef: `retry:${hashPrompt(lastRaw)}`,
            maxRepairAttempts: config.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS,
            lockedTerms: config.lockedTerms,
            sendRepair,
          },
          { db: this.db },
        );
        return {
          job: requireJob(),
          message: loop.message,
          loop,
        };
      }

      default: {
        const _exhaustive: never = action;
        return _exhaustive;
      }
    }
  }

  private toJobDto(row: JobRow): JobDto {
    const progress = parseProgress(row.progress);
    const config = parseConfig(row.config);
    const attentionActions =
      row.state === 'NEEDS_ATTENTION' ? [...ATTENTION_ACTIONS] : [];

    const chunkIndex =
      typeof progress.chunkIndex === 'number' ? progress.chunkIndex : undefined;
    const chunkTotal =
      typeof progress.chunkTotal === 'number' ? progress.chunkTotal : undefined;
    const paragraphsDone =
      typeof progress.paragraphsDone === 'number'
        ? progress.paragraphsDone
        : undefined;
    const paragraphsTotal =
      typeof progress.paragraphsTotal === 'number'
        ? progress.paragraphsTotal
        : undefined;
    const phase = typeof progress.phase === 'string' ? progress.phase : undefined;
    const providerType =
      typeof progress.providerType === 'string' ? progress.providerType : undefined;
    const packMode = isPackModeOrLegacy(progress.packMode)
      ? normalizePackMode(progress.packMode)
      : undefined;
    const notebookId =
      typeof progress.notebookId === 'string'
        ? progress.notebookId
        : progress.notebookId === null
          ? null
          : undefined;
    const localKnowledgeVersion =
      typeof progress.localKnowledgeVersion === 'number'
        ? progress.localKnowledgeVersion
        : undefined;
    const notebookVerifiedVersion =
      typeof progress.notebookVerifiedVersion === 'number'
        ? progress.notebookVerifiedVersion
        : undefined;
    const hotDeltaCount =
      typeof progress.hotDeltaCount === 'number' ? progress.hotDeltaCount : undefined;
    const learningRaw =
      progress.learning && typeof progress.learning === 'object'
        ? (progress.learning as Record<string, unknown>)
        : null;
    const learning = learningRaw
      ? {
          candidatesCreated:
            typeof learningRaw.candidatesCreated === 'number'
              ? learningRaw.candidatesCreated
              : undefined,
          memoryApplied:
            typeof learningRaw.memoryApplied === 'number'
              ? learningRaw.memoryApplied
              : undefined,
          conflicts:
            typeof learningRaw.conflicts === 'number' ? learningRaw.conflicts : undefined,
          consolidated:
            typeof learningRaw.consolidated === 'boolean'
              ? learningRaw.consolidated
              : undefined,
          archived:
            typeof learningRaw.archived === 'number' ? learningRaw.archived : undefined,
          emptyDeltas:
            typeof learningRaw.emptyDeltas === 'boolean'
              ? learningRaw.emptyDeltas
              : undefined,
        }
      : undefined;
    const notebookName =
      typeof progress.notebookName === 'string' ? progress.notebookName : undefined;
    const notebookRole =
      progress.notebookRole === 'TRANSLATION' ||
      progress.notebookRole === 'RESEARCH' ||
      progress.notebookRole === 'SINGLE'
        ? progress.notebookRole
        : undefined;
    const notebookGroundingVerified =
      typeof progress.notebookGroundingVerified === 'boolean'
        ? progress.notebookGroundingVerified
        : undefined;
    const notebookKnowledgeVersion =
      typeof progress.notebookKnowledgeVersion === 'number'
        ? progress.notebookKnowledgeVersion
        : notebookVerifiedVersion;
    const knowledgeSourceMode =
      progress.knowledgeSourceMode === 'STATIC' ||
      progress.knowledgeSourceMode === 'LOCAL_ONLY'
        ? progress.knowledgeSourceMode
        : undefined;
    const timeline = Array.isArray(progress.timeline)
      ? (progress.timeline as { at?: unknown; event?: unknown; message?: string }[])
          .filter((e): e is { at: string; event: string } => typeof e.at === 'string' && typeof e.event === 'string')
          .slice(-40)
      : undefined;
    const accountIdProgress =
      typeof progress.accountId === 'string' ? progress.accountId : undefined;
    const threadRef =
      typeof progress.threadRef === 'string'
        ? progress.threadRef
        : progress.threadRef === null
          ? null
          : undefined;
    const knowledgeVersion =
      typeof progress.knowledgeVersion === 'number'
        ? progress.knowledgeVersion
        : undefined;
    const hasProgress =
      phase != null ||
      chunkIndex != null ||
      chunkTotal != null ||
      paragraphsDone != null ||
      paragraphsTotal != null ||
      providerType != null ||
      packMode != null ||
      notebookId !== undefined ||
      notebookName != null ||
      notebookRole != null ||
      notebookGroundingVerified != null ||
      accountIdProgress != null ||
      threadRef !== undefined ||
      knowledgeVersion != null ||
      localKnowledgeVersion != null ||
      notebookVerifiedVersion != null ||
      notebookKnowledgeVersion != null ||
      hotDeltaCount != null ||
      knowledgeSourceMode != null ||
      (timeline != null && timeline.length > 0) ||
      learning != null;

    return {
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      state: row.state,
      workerId: row.worker_id,
      priority: row.priority,
      chapterFrom: row.chapter_from ?? null,
      chapterTo: row.chapter_to ?? null,
      workerMode: row.worker_mode === 'PINNED' ? 'PINNED' : 'POOL',
      pinnedAccountId: row.pinned_account_id ?? null,
      attemptCount: row.attempt_count,
      error: row.error,
      pausedReason: row.paused_reason,
      maxRepairAttempts: config.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS,
      repairRound: typeof progress.repairRound === 'number' ? progress.repairRound : 0,
      lastQa: safeParseQa(progress.qa),
      lastParsed: safeParseParsed(progress.parsed),
      attentionActions,
      progress: hasProgress
        ? {
            phase,
            chunkIndex,
            chunkTotal,
            paragraphsDone,
            paragraphsTotal,
            providerType,
            packMode,
            notebookId,
            notebookName,
            notebookRole,
            notebookGroundingVerified,
            accountId: accountIdProgress,
            threadRef,
            knowledgeVersion,
            localKnowledgeVersion,
            notebookKnowledgeVersion,
            notebookVerifiedVersion,
            hotDeltaCount,
            knowledgeSourceMode,
            timeline,
            learning,
          }
        : null,
      knowledgeVersionAtStart: row.knowledge_version_at_start ?? null,
      knowledgeVersionAtCommit: row.knowledge_version_at_commit ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }
}

function toAttemptDto(row: JobAttemptRow): JobAttemptDto {
  const packMode =
    typeof row.pack_mode === 'string' ? normalizePackMode(row.pack_mode) : null;
  return {
    id: row.id,
    jobId: row.job_id,
    attemptNumber: row.attempt_number,
    state: row.state,
    reason: row.reason,
    inputRef: row.input_ref,
    output: row.output,
    result: row.result,
    error: row.error,
    providerType: row.provider_type ?? null,
    accountId: row.account_id ?? null,
    notebookId: row.notebook_id ?? null,
    threadRef: row.thread_ref ?? null,
    packMode,
    knowledgeVersion: row.knowledge_version ?? null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function parseConfig(raw: string | null): {
  batchParagraphs: RepairParagraph[];
  sourceParagraphIds: string[];
  maxRepairAttempts?: number;
  lockedTerms?: LockedTermForQa[];
} {
  if (!raw) {
    return { batchParagraphs: [], sourceParagraphIds: [] };
  }
  try {
    return JSON.parse(raw) as {
      batchParagraphs: RepairParagraph[];
      sourceParagraphIds: string[];
      maxRepairAttempts?: number;
      lockedTerms?: LockedTermForQa[];
    };
  } catch {
    return { batchParagraphs: [], sourceParagraphIds: [] };
  }
}

function parseProgress(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeParseQa(value: unknown): JobDto['lastQa'] {
  if (value == null) return null;
  const parsed = QaResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function safeParseParsed(value: unknown): JobDto['lastParsed'] {
  if (value == null) return null;
  const parsed = ParsedBatchResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function findLastOutput(attempts: JobAttemptRow[]): string | null {
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    const out = attempts[i]?.output;
    if (out) return out;
  }
  return null;
}
