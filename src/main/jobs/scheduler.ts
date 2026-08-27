import type { DatabaseManager } from '../db/database-manager';
import { WorkerPool } from './worker-pool';
import { BatchExecutor, newLeaseOwner, type JobInitialSender } from './batch-executor';
import type { RepairSender } from './repair-loop';
import {
  DEFAULT_JOB_LEASE_MS,
  DEFAULT_MAX_CONCURRENT_WORKERS,
  DEFAULT_QUOTA_COOLDOWN_MS,
  DEFAULT_SCHEDULER_TICK_MS,
  SCHEDULER_SETTING_KEYS,
} from '@shared/constants/job';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { recoverJobsGeminiAndProfilesOnStartup } from '../gemini/startup-recovery';
import { pathsService } from '../services/paths-service';
import { logger } from '../logging/logger';

export interface SchedulerOptions {
  maxConcurrentWorkers?: number;
  tickMs?: number;
  leaseMs?: number;
  quotaCooldownMs?: number;
  sendInitial: JobInitialSender;
  sendRepair?: RepairSender;
  /** Injected clock for tests. */
  now?: () => number;
}

/**
 * Durable SQLite-backed scheduler.
 * - No in-memory-only queue
 * - One job per browser profile (profile lock)
 * - Multiple workers in parallel up to maxConcurrent
 * - Graceful shutdown waits for in-flight or abandons lease renew
 */
export class AutomationScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private shuttingDown = false;
  private readonly inFlight = new Set<string>();
  private readonly pool: WorkerPool;
  private readonly executor: BatchExecutor;
  private readonly leaseOwner: string;
  private readonly maxConcurrent: number;
  private readonly tickMs: number;
  private readonly leaseMs: number;

  constructor(
    private readonly db: DatabaseManager,
    options: SchedulerOptions,
  ) {
    this.pool = new WorkerPool(db);
    this.executor = new BatchExecutor(db, {
      sendInitial: options.sendInitial,
      sendRepair: options.sendRepair,
      quotaCooldownMs: options.quotaCooldownMs ?? DEFAULT_QUOTA_COOLDOWN_MS,
      leaseMs: options.leaseMs ?? DEFAULT_JOB_LEASE_MS,
    });
    this.leaseOwner = newLeaseOwner();
    this.maxConcurrent =
      options.maxConcurrentWorkers ??
      this.readMaxConcurrent() ??
      DEFAULT_MAX_CONCURRENT_WORKERS;
    this.tickMs = options.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
    this.leaseMs = options.leaseMs ?? DEFAULT_JOB_LEASE_MS;
  }

  isRunning(): boolean {
    return this.running && !this.shuttingDown;
  }

  getInFlightCount(): number {
    return this.inFlight.size;
  }

  start(): void {
    if (this.timer) return;
    this.running = true;
    this.shuttingDown = false;
    // Recover jobs / gemini_requests / profile leases — not only expired scheduler leases.
    try {
      const profilesRoot = pathsService.getPath('browserProfiles');
      recoverJobsGeminiAndProfilesOnStartup(this.db, { profilesRoot });
    } catch (error) {
      logger.warn('Startup job/gemini recovery failed; falling back to lease recover', {
        message: error instanceof Error ? error.message : String(error),
      });
      const recovered = this.db.jobs.recoverExpiredLeases();
      if (recovered > 0) {
        logger.info('Scheduler recovered expired leases', { recovered });
      }
    }
    this.db.workerStates.clearExpiredLimits();
    this.timer = setInterval(() => {
      this.tick();
    }, this.tickMs);
    // Don't keep process alive solely for timer in Electron main — unref when possible
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
    this.tick();
  }

  /** Graceful shutdown: stop claiming; wait for in-flight to finish (or timeout). */
  async stop(options?: { waitMs?: number }): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const waitMs = options?.waitMs ?? 10_000;
    const started = Date.now();
    while (this.inFlight.size > 0 && Date.now() - started < waitMs) {
      await sleep(50);
    }
    // Remaining in-flight: release leases so next start recovers
    for (const jobId of this.inFlight) {
      this.db.jobs.releaseLease(jobId);
      const job = this.db.jobs.getById(jobId);
      if (job && !['COMPLETED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELLED'].includes(job.state)) {
        this.db.jobs.updateState(jobId, 'QUEUED', 'Scheduler shutdown — requeued');
      }
      if (job?.worker_id) {
        this.db.workerStates.markReady(job.worker_id);
      }
    }
    this.inFlight.clear();
    this.running = false;
  }

  pauseAll(): number {
    this.writeSetting(SCHEDULER_SETTING_KEYS.pauseAll, '1');
    return this.db.jobs.pauseAllQueued();
  }

  resumeAll(): number {
    this.writeSetting(SCHEDULER_SETTING_KEYS.pauseAll, '0');
    return this.db.jobs.resumeAllPaused();
  }

  isPaused(): boolean {
    return this.readSetting(SCHEDULER_SETTING_KEYS.pauseAll) === '1';
  }

  setMaxConcurrent(n: number): void {
    this.writeSetting(SCHEDULER_SETTING_KEYS.maxConcurrentWorkers, String(n));
  }

  tick(): void {
    if (this.shuttingDown || this.isPaused()) return;

    this.db.jobs.recoverExpiredLeases();
    this.db.workerStates.clearExpiredLimits();

    const capacity =
      Math.min(this.maxConcurrent, this.readMaxConcurrent() ?? this.maxConcurrent) -
      this.inFlight.size;
    if (capacity <= 0) return;

    for (let i = 0; i < capacity; i += 1) {
      const available = this.pool.listAvailable();
      if (available.length === 0) break;

      // Try each available worker until one claims a job
      let claimed = false;
      for (const worker of available) {
        if (this.inFlight.size >= this.maxConcurrent) break;
        const job = this.db.jobs.claimNext({
          leaseOwner: this.leaseOwner,
          leaseMs: this.leaseMs,
          workerId: worker.id,
          accountId: worker.google_account_id,
        });
        if (!job) continue;

        claimed = true;
        this.inFlight.add(job.id);
        // Mark BUSY immediately so next capacity slot cannot double-claim same profile
        this.db.workerStates.markBusy(worker.id, job.id);
        this.db.jobs.updateState(job.id, 'WAITING_WORKER');
        const profile = this.db.googleAccounts.getProfile(worker.google_account_id);
        if (!profile) {
          this.db.jobs.updateState(job.id, 'QUEUED', 'Missing profile');
          this.db.jobs.releaseLease(job.id);
          this.db.workerStates.markReady(worker.id);
          this.inFlight.delete(job.id);
          continue;
        }
        const profilePath = browserProfileManager.resolveProfilePath(
          profile.profile_dir_name,
        );
        void this.runJob(
          job.id,
          worker.google_account_id,
          profilePath,
          worker.id,
        );
        break;
      }
      if (!claimed) break;
    }
  }

  private async runJob(
    jobId: string,
    accountId: string,
    profilePath: string,
    workerId: string,
  ): Promise<void> {
    try {
      this.db.jobs.assignWorker(jobId, workerId);
      const fresh = this.db.jobs.getById(jobId);
      if (!fresh) return;

      await this.executor.execute({
        job: fresh,
        accountId,
        profilePath,
        leaseOwner: this.leaseOwner,
      });
    } catch (error) {
      logger.warn('Scheduler job run failed', {
        jobId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.inFlight.delete(jobId);
    }
  }

  private readMaxConcurrent(): number | null {
    const raw = this.readSetting(SCHEDULER_SETTING_KEYS.maxConcurrentWorkers);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private readSetting(key: string): string | null {
    try {
      return this.db.appMeta.get(key);
    } catch {
      return null;
    }
  }

  private writeSetting(key: string, value: string): void {
    this.db.appMeta.set(key, value);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
