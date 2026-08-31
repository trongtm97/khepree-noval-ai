import type { DatabaseManager } from '../db/database-manager';
import { ExecutionTargetPool } from './execution-target-pool';
import { BatchExecutor, newLeaseOwner, type JobInitialSender } from './batch-executor';
import type { RepairSender } from './repair-loop';
import {
  DEFAULT_JOB_LEASE_MS,
  DEFAULT_QUOTA_COOLDOWN_MS,
  DEFAULT_SCHEDULER_TICK_MS,
  SCHEDULER_SETTING_KEYS,
} from '@shared/constants/job';
import {
  DEFAULT_CONCURRENCY_POLICY,
  GLOBAL_MAX_MODE_AUTO,
  type ConcurrencyPolicy,
  type GlobalMaxWorkersMode,
} from '@shared/constants/concurrency-policy';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { recoverJobsGeminiAndProfilesOnStartup } from '../gemini/startup-recovery';
import { pathsService } from '../services/paths-service';
import { logger } from '../logging/logger';
import {
  buildConcurrencySnapshot,
  canAdmitJob,
  effectivePerProjectMax,
  loadConcurrencyPolicy,
  resolveGlobalMaxWorkers,
  saveConcurrencyPolicy,
  type ConcurrencyPolicyPatch,
  type InFlightSlot,
} from './concurrency-policy';
import { providerKindForTarget } from './execution-target-utils';
import type { AiExecutionTarget } from '../ai/execution-target';

export interface SchedulerOptions {
  concurrencyPolicy?: Partial<ConcurrencyPolicy>;
  /**
   * Legacy alias for concurrencyPolicy.globalMaxWorkers (fixed int mode).
   * Prefer concurrencyPolicy for new code.
   */
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
 * - ConcurrencyPolicy: global / per-provider / per-account / per-project
 * - Fair project round-robin (no single novel starves queue)
 * - Fair execution-target pick: priority, quota, LRU — not first DB row
 */
export class AutomationScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private shuttingDown = false;
  private readonly inFlight = new Set<string>();
  private readonly inFlightMeta = new Map<string, InFlightSlot>();
  /** Round-robin cursor over queued projects. */
  private projectRrCursor = 0;
  private readonly pool: ExecutionTargetPool;
  private readonly executor: BatchExecutor;
  private readonly leaseOwner: string;
  private readonly tickMs: number;
  private readonly leaseMs: number;
  private readonly policyOverrides: Partial<ConcurrencyPolicy>;

  constructor(
    private readonly db: DatabaseManager,
    options: SchedulerOptions,
  ) {
    this.pool = new ExecutionTargetPool(db);
    this.executor = new BatchExecutor(db, {
      sendInitial: options.sendInitial,
      sendRepair: options.sendRepair,
      quotaCooldownMs: options.quotaCooldownMs ?? DEFAULT_QUOTA_COOLDOWN_MS,
      leaseMs: options.leaseMs ?? DEFAULT_JOB_LEASE_MS,
    });
    this.leaseOwner = newLeaseOwner();
    this.tickMs = options.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
    this.leaseMs = options.leaseMs ?? DEFAULT_JOB_LEASE_MS;
    this.policyOverrides = { ...(options.concurrencyPolicy ?? {}) };
    if (
      options.maxConcurrentWorkers != null &&
      this.policyOverrides.globalMaxWorkers === undefined
    ) {
      this.policyOverrides.globalMaxWorkers = options.maxConcurrentWorkers;
    }
  }

  isRunning(): boolean {
    return this.running && !this.shuttingDown;
  }

  getInFlightCount(): number {
    return this.inFlight.size;
  }

  getEffectiveMaxConcurrent(): number {
    const policy = this.resolvePolicy();
    const ready = this.pool.listAvailable().length + this.countBusyWorkers();
    return resolveGlobalMaxWorkers(policy, Math.max(ready, this.inFlight.size));
  }

  getConcurrencyPolicy(): ConcurrencyPolicy {
    return this.resolvePolicy();
  }

  updateConcurrencyPolicy(patch: ConcurrencyPolicyPatch): ConcurrencyPolicy {
    return saveConcurrencyPolicy(this.db, patch);
  }

  start(): void {
    if (this.timer) return;
    this.running = true;
    this.shuttingDown = false;
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
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
    this.tick();
  }

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
    for (const jobId of this.inFlight) {
      this.db.jobs.releaseLease(jobId);
      const job = this.db.jobs.getById(jobId);
      if (job && !['COMPLETED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELLED'].includes(job.state)) {
        this.db.jobs.updateState(jobId, 'QUEUED', 'Scheduler shutdown — requeued');
      }
      if (job?.worker_id) {
        this.db.workerStates.markReady(job.worker_id);
      }
      this.inFlightMeta.delete(jobId);
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

  setMaxConcurrent(n: number | typeof GLOBAL_MAX_MODE_AUTO): void {
    if (n === GLOBAL_MAX_MODE_AUTO) {
      saveConcurrencyPolicy(this.db, { globalMaxWorkers: GLOBAL_MAX_MODE_AUTO });
      return;
    }
    saveConcurrencyPolicy(this.db, { globalMaxWorkers: n });
  }

  tick(): void {
    if (this.shuttingDown || this.isPaused()) return;

    this.db.jobs.recoverExpiredLeases();
    this.db.workerStates.clearExpiredLimits();

    const policy = this.resolvePolicy();
    const busyAccountIds = this.busyAccountIds();
    const readyTargets = this.pool.listAvailable({ busyAccountIds });
    const globalMax = resolveGlobalMaxWorkers(
      policy,
      readyTargets.length + this.countBusyWorkers(),
    );
    let capacity = globalMax - this.inFlight.size;
    if (capacity <= 0) return;

    const projects = this.fairProjectOrder();
    if (projects.length === 0) return;

    let claimedThisTick = 0;

    for (let pass = 0; pass < projects.length && capacity > 0; pass += 1) {
      const projectId = projects[pass];
      let snap = buildConcurrencySnapshot(this.inFlightMeta.values());
      const projectMax = effectivePerProjectMax(policy);
      if ((snap.byProject.get(projectId) ?? 0) >= projectMax) continue;

      const targets = this.pool.listAvailableFair({ projectId, busyAccountIds });
      if (targets.length === 0) continue;

      for (const target of targets) {
        const providerKind = providerKindForTarget(target);
        snap = buildConcurrencySnapshot(this.inFlightMeta.values());
        if (
          !canAdmitJob(policy, snap, {
            projectId,
            accountId: target.concurrencyKey,
            providerKind,
          })
        ) {
          continue;
        }

        const workerStateId = target.legacyWorkerStateId ?? null;
        const job = this.db.jobs.claimNext({
          leaseOwner: this.leaseOwner,
          leaseMs: this.leaseMs,
          workerId: workerStateId,
          accountId: target.concurrencyKey,
          projectId,
        });
        if (!job) continue;

        this.db.jobs.assignExecutionTarget(job.id, {
          executionWorkerId: target.workerId,
          executionProviderId: target.providerId,
          executionProviderType: target.providerType,
          executionAccountKind: target.accountKind,
          executionAccountId: target.accountId,
          workerId: target.legacyWorkerStateId ?? null,
        });

        const slot: InFlightSlot = {
          jobId: job.id,
          projectId: job.project_id,
          accountId: target.concurrencyKey,
          providerKind,
        };
        this.inFlight.add(job.id);
        this.inFlightMeta.set(job.id, slot);
        if (target.legacyWorkerStateId) {
          this.db.workerStates.markBusy(target.legacyWorkerStateId, job.id);
        }
        this.db.jobs.updateState(job.id, 'WAITING_WORKER');

        const profilePath = this.resolveProfilePath(target);
        if (target.capabilities.browserProfile && !profilePath) {
          this.db.jobs.updateState(job.id, 'QUEUED', 'Missing profile');
          this.db.jobs.releaseLease(job.id);
          if (target.legacyWorkerStateId) {
            this.db.workerStates.markReady(target.legacyWorkerStateId);
          }
          this.inFlight.delete(job.id);
          this.inFlightMeta.delete(job.id);
          continue;
        }

        void this.runJob(job.id, target, profilePath);
        claimedThisTick += 1;
        capacity -= 1;
        busyAccountIds.add(target.concurrencyKey);
        this.projectRrCursor = (this.projectRrCursor + 1) % Math.max(projects.length, 1);
        break;
      }
    }

    if (claimedThisTick === 0 && projects.length > 0) {
      this.projectRrCursor = (this.projectRrCursor + 1) % projects.length;
    }
  }

  private busyAccountIds(): Set<string> {
    const busy = new Set<string>();
    for (const slot of this.inFlightMeta.values()) {
      busy.add(slot.accountId);
    }
    return busy;
  }

  private resolveProfilePath(target: AiExecutionTarget): string {
    if (!target.profileDirName) {
      if (target.accountKind === 'GOOGLE_ACCOUNT') {
        const profile = this.db.googleAccounts.getProfile(target.accountId);
        if (!profile?.profile_dir_name) return '';
        return browserProfileManager.resolveProfilePath(profile.profile_dir_name);
      }
      return '';
    }
    return browserProfileManager.resolveProfilePath(target.profileDirName);
  }

  private fairProjectOrder(): string[] {
    const ids = this.db.jobs.listQueuedProjectIds();
    if (ids.length === 0) return [];
    const start = this.projectRrCursor % ids.length;
    return [...ids.slice(start), ...ids.slice(0, start)];
  }

  private resolvePolicy(): ConcurrencyPolicy {
    const loaded = loadConcurrencyPolicy(this.db);
    return {
      ...DEFAULT_CONCURRENCY_POLICY,
      ...loaded,
      ...this.policyOverrides,
      perAccountMax: {
        ...DEFAULT_CONCURRENCY_POLICY.perAccountMax,
        ...loaded.perAccountMax,
        ...this.policyOverrides.perAccountMax,
      },
      autoCap: this.policyOverrides.autoCap ?? loaded.autoCap,
    };
  }

  private countBusyWorkers(): number {
    try {
      return this.db.workerStates.countBusy();
    } catch {
      return this.inFlight.size;
    }
  }

  private async runJob(
    jobId: string,
    target: AiExecutionTarget,
    profilePath: string,
  ): Promise<void> {
    try {
      const fresh = this.db.jobs.getById(jobId);
      if (!fresh) return;

      await this.executor.execute({
        job: fresh,
        executionTarget: target,
        accountId: target.accountId,
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
      this.inFlightMeta.delete(jobId);
    }
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

export type { GlobalMaxWorkersMode };
