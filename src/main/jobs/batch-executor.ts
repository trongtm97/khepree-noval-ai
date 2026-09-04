import type { DatabaseManager } from '../db/database-manager';
import type { JobRow } from '../db/repositories/job-repository';
import type { AiExecutionTarget } from '../ai/execution-target';
import { runRepairLoop, type RepairSender } from './repair-loop';
import type { RepairParagraph } from './repair-strategies';
import type { LockedTermForQa } from './qa-checker';
import {
  DEFAULT_JOB_LEASE_MS,
  DEFAULT_LEASE_HEARTBEAT_MS,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  DEFAULT_QUOTA_COOLDOWN_MS,
} from '@shared/constants/job';
import { profileLockManager, startLeaseHeartbeat } from '../automation/browser-runner/profile-lock';
import { logger } from '../logging/logger';
import { newId } from '../db/utils/uuid';

export interface JobExecuteContext {
  job: JobRow;
  executionTarget: AiExecutionTarget;
  profilePath: string;
  leaseOwner: string;
  /**
   * Transitional alias — equals executionTarget.accountId.
   * New code must use executionTarget, not assume Google account.
   */
  accountId: string;
  /** When true, stop after await points without further DB mutations. */
  shouldAbort?: () => boolean;
}

export interface InitialSendResult {
  rawResponse: string;
  inputRef: string;
}

/**
 * Injected runner — production wires Gemini; tests use fixtures.
 * Must not open a second Chromium on the same profile (caller holds profile lock).
 */
export type JobInitialSender = (ctx: JobExecuteContext) => Promise<InitialSendResult>;

export interface BatchExecutorOptions {
  sendInitial: JobInitialSender;
  sendRepair?: RepairSender;
  quotaCooldownMs?: number;
  /** Must match scheduler claim lease length. */
  leaseMs?: number;
  leaseHeartbeatMs?: number;
}

/**
 * Advances claimed job through SENDING → WAITING_AI → repair loop → COMPLETED.
 */
export class BatchExecutor {
  constructor(
    private readonly db: DatabaseManager,
    private readonly options: BatchExecutorOptions,
  ) {}

  async execute(ctx: JobExecuteContext): Promise<{ finalState: string }> {
    const { job, profilePath, leaseOwner } = ctx;
    const ownerId = `job:${job.id}:${leaseOwner}`;
    const leaseMs = this.options.leaseMs ?? DEFAULT_JOB_LEASE_MS;
    const heartbeatMs = this.options.leaseHeartbeatMs ?? DEFAULT_LEASE_HEARTBEAT_MS;
    const startedAt = Date.now();
    let finalStateForLedger = 'ERROR';

    if (profilePath) {
      profileLockManager.acquireLease({
        profilePath,
        ownerId,
        accountId: ctx.executionTarget.concurrencyKey,
        operation: 'translation',
        label: `Dịch job ${job.id.slice(0, 8)}…`,
      });
    }
    const stopProfileHeartbeat = profilePath
      ? startLeaseHeartbeat(profileLockManager, {
          profilePath,
          ownerId,
        })
      : () => undefined;
    const legacyWorkerId = ctx.executionTarget.legacyWorkerStateId;
    if (legacyWorkerId) {
      this.db.workerStates.markBusy(legacyWorkerId, job.id);
    } else if (job.worker_id) {
      this.db.workerStates.markBusy(job.worker_id, job.id);
    }

    // Keep lease alive for multi-chunk / slow Gemini calls (default lease alone is too short).
    const heartbeat = setInterval(() => {
      if (ctx.shouldAbort?.()) return;
      try {
        if (!this.db.getConnection().open) return;
        const ok = this.db.jobs.renewLease(job.id, leaseOwner, leaseMs);
        if (!ok) {
          logger.warn('Job lease renew failed — scheduler may have reclaimed job', {
            jobId: job.id,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/not open|closed/i.test(message)) return;
        logger.warn('Job lease renew error', { jobId: job.id, message });
      }
    }, heartbeatMs);

    try {
      this.db.jobs.updateState(job.id, 'SENDING');
      this.db.jobs.updateProgress(
        job.id,
        JSON.stringify({
          phase: 'sending',
          accountId: ctx.executionTarget.accountId,
          executionWorkerId: ctx.executionTarget.workerId,
          providerId: ctx.executionTarget.providerId,
          accountKind: ctx.executionTarget.accountKind,
        }),
      );

      let initial: InitialSendResult;
      try {
        initial = await this.options.sendInitial(ctx);
      } catch (error) {
        if (ctx.shouldAbort?.()) {
          finalStateForLedger = 'ABORTED';
          return { finalState: 'QUEUED' };
        }
        const message = error instanceof Error ? error.message : String(error);
        if (/QUOTA_LIMIT|quota/i.test(message) && legacyWorkerId) {
          const until = new Date(
            Date.now() + (this.options.quotaCooldownMs ?? DEFAULT_QUOTA_COOLDOWN_MS),
          ).toISOString();
          this.db.workerStates.markLimited(legacyWorkerId, until, message);
          this.db.jobs.updateState(job.id, 'QUEUED', 'Worker LIMITED — requeued');
          this.db.jobs.releaseLease(job.id);
          finalStateForLedger = 'QUOTA_REQUEUE';
          return { finalState: 'QUEUED' };
        }
        throw error;
      }

      if (ctx.shouldAbort?.()) {
        finalStateForLedger = 'ABORTED';
        return { finalState: 'QUEUED' };
      }

      this.db.jobs.updateState(job.id, 'WAITING_AI');

      const config = parseJobConfig(job.config);
      const sendRepair: RepairSender =
        this.options.sendRepair ??
        (() => {
          return Promise.reject(new Error('No repair sender configured'));
        });

      const loop = await runRepairLoop(
        {
          jobId: job.id,
          projectId: job.project_id,
          batchParagraphs: config.batchParagraphs,
          sourceParagraphIds: config.sourceParagraphIds,
          initialRawResponse: initial.rawResponse,
          initialInputRef: initial.inputRef,
          maxRepairAttempts: config.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS,
          lockedTerms: config.lockedTerms,
          qaLevel: config.qaLevel,
          repairScope: config.repairScope,
          sendRepair,
        },
        { db: this.db },
      );

      this.db.jobs.releaseLease(job.id);
      finalStateForLedger = loop.finalState;
      return { finalState: loop.finalState };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('BatchExecutor failed', { jobId: job.id, message });
      try {
        const existing = this.db.jobs.listAttempts(job.id);
        const attemptNumber =
          existing.length === 0
            ? 1
            : Math.max(...existing.map((a) => a.attempt_number)) + 1;
        const attempt = this.db.jobs.startAttempt({
          job_id: job.id,
          attempt_number: attemptNumber,
          state: 'RUNNING',
          reason: 'EXECUTOR_ERROR',
        });
        this.db.jobs.completeAttempt(attempt.id, {
          state: 'FAILED',
          error: message,
          result: JSON.stringify({
            phase: 'provider_error',
            message,
            stop: 'executor',
          }),
        });
      } catch (attemptError) {
        logger.warn('Failed to record executor attempt', {
          jobId: job.id,
          message:
            attemptError instanceof Error ? attemptError.message : String(attemptError),
        });
      }
      this.db.jobs.markNeedsAttention(job.id, 'EXECUTOR_ERROR', message);
      this.db.jobs.releaseLease(job.id);
      if (legacyWorkerId) {
        this.db.workerStates.setHealth(legacyWorkerId, 'NEEDS_ATTENTION', {
          lastError: message,
        });
      }
      finalStateForLedger = 'NEEDS_ATTENTION';
      return { finalState: 'NEEDS_ATTENTION' };
    } finally {
      clearInterval(heartbeat);
      stopProfileHeartbeat();
      this.recordUsageLedger(ctx, job, startedAt, finalStateForLedger);
      if (profilePath) {
        try {
          profileLockManager.releaseLease(profilePath, ownerId);
        } catch (error) {
          logger.warn('Profile lease release failed', {
            jobId: job.id,
            message: error instanceof Error ? error.message : String(error),
          });
          profileLockManager.recoverIfStale(profilePath);
        }
        try {
          const { getBrowserRuntimeManager } = await import(
            '../automation/browser-runner/browser-runtime-manager'
          );
          getBrowserRuntimeManager().adoptRuntimeLockIfNeeded(
            ctx.executionTarget.concurrencyKey,
            profilePath,
          );
        } catch {
          // Runtime manager optional during early boot / tests without init
        }
      }
      const releaseWorkerId = legacyWorkerId ?? job.worker_id;
      if (releaseWorkerId) {
        const worker = this.db.workerStates.getById(releaseWorkerId);
        if (worker?.health === 'BUSY') {
          this.db.workerStates.markReady(releaseWorkerId);
        }
      }
      try {
        const { getSourceFolderService } = await import(
          '../source-folder/source-folder-singleton'
        );
        await getSourceFolderService().flushPendingRevisionsForProject(job.project_id);
      } catch (pendingError) {
        logger.warn('pending source revision flush failed', {
          jobId: job.id,
          projectId: job.project_id,
          message:
            pendingError instanceof Error ? pendingError.message : String(pendingError),
        });
      }
    }
  }

  private recordUsageLedger(
    ctx: JobExecuteContext,
    job: JobRow,
    startedAt: number,
    outcome: string,
  ): void {
    try {
      const config = parseJobConfig(job.config);
      const charCount = (config.batchParagraphs ?? []).reduce(
        (sum, p) => sum + (p.sourceText?.length ?? 0),
        0,
      );
      const requestCount = Math.max(1, this.db.jobs.listAttempts(job.id).length || 1);
      this.db.usageLedger.append({
        projectId: job.project_id,
        jobId: job.id,
        accountId: ctx.executionTarget.accountId,
        providerType: ctx.executionTarget.providerType,
        requestCount,
        charCount,
        durationMs: Date.now() - startedAt,
        outcome,
      });
    } catch (error) {
      logger.warn('usage_ledger append failed', {
        jobId: job.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export interface TranslateJobConfig {
  batchParagraphs: RepairParagraph[];
  sourceParagraphIds: string[];
  maxRepairAttempts?: number;
  maxContinuationAttempts?: number;
  lockedTerms?: LockedTermForQa[];
  chapterIds?: string[];
  batchDecisionId?: string | null;
  qaLevel?: 'basic' | 'standard' | 'strict';
  repairScope?: 'structure_only' | 'targeted' | 'bounded';
}

export function parseJobConfig(raw: string | null): TranslateJobConfig {
  if (!raw) {
    return { batchParagraphs: [], sourceParagraphIds: [] };
  }
  try {
    return JSON.parse(raw) as TranslateJobConfig;
  } catch {
    return { batchParagraphs: [], sourceParagraphIds: [] };
  }
}

export function newLeaseOwner(): string {
  return `sched-${newId().slice(0, 8)}`;
}
