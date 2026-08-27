import type { DatabaseManager } from '../db/database-manager';
import type { JobRow } from '../db/repositories/job-repository';
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
  accountId: string;
  profilePath: string;
  leaseOwner: string;
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

    profileLockManager.acquireLease({
      profilePath,
      ownerId,
      accountId: ctx.accountId,
      operation: 'translation',
      label: `Dịch job ${job.id.slice(0, 8)}…`,
    });
    const stopProfileHeartbeat = startLeaseHeartbeat(profileLockManager, {
      profilePath,
      ownerId,
    });
    if (job.worker_id) {
      this.db.workerStates.markBusy(job.worker_id, job.id);
    }

    // Keep lease alive for multi-chunk / slow Gemini calls (default lease alone is too short).
    const heartbeat = setInterval(() => {
      const ok = this.db.jobs.renewLease(job.id, leaseOwner, leaseMs);
      if (!ok) {
        logger.warn('Job lease renew failed — scheduler may have reclaimed job', {
          jobId: job.id,
        });
      }
    }, heartbeatMs);

    try {
      this.db.jobs.updateState(job.id, 'SENDING');
      this.db.jobs.updateProgress(
        job.id,
        JSON.stringify({ phase: 'sending', accountId: ctx.accountId }),
      );

      let initial: InitialSendResult;
      try {
        initial = await this.options.sendInitial(ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/QUOTA_LIMIT|quota/i.test(message) && job.worker_id) {
          const until = new Date(
            Date.now() + (this.options.quotaCooldownMs ?? DEFAULT_QUOTA_COOLDOWN_MS),
          ).toISOString();
          this.db.workerStates.markLimited(job.worker_id, until, message);
          this.db.jobs.updateState(job.id, 'QUEUED', 'Worker LIMITED — requeued');
          this.db.jobs.releaseLease(job.id);
          return { finalState: 'QUEUED' };
        }
        throw error;
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
          sendRepair,
        },
        { db: this.db },
      );

      this.db.jobs.releaseLease(job.id);
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
      if (job.worker_id) {
        this.db.workerStates.setHealth(job.worker_id, 'NEEDS_ATTENTION', {
          lastError: message,
        });
      }
      return { finalState: 'NEEDS_ATTENTION' };
    } finally {
      clearInterval(heartbeat);
      stopProfileHeartbeat();
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
        getBrowserRuntimeManager().adoptRuntimeLockIfNeeded(ctx.accountId, profilePath);
      } catch {
        // Runtime manager optional during early boot / tests without init
      }
      if (job.worker_id) {
        const worker = this.db.workerStates.getById(job.worker_id);
        if (worker?.health === 'BUSY') {
          this.db.workerStates.markReady(job.worker_id);
        }
      }
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
