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
import { resolveAutoConcurrencyCaps } from './auto-throughput-policy';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { recoverJobsGeminiAndProfilesOnStartup } from '../gemini/startup-recovery';
import { pathsService } from '../services/paths-service';
import { logger } from '../logging/logger';
import {
  buildConcurrencySnapshot,
  canAdmitJob,
  DEFAULT_PER_PROJECT_MAX,
  loadConcurrencyPolicy,
  resolveGlobalMaxWorkers,
  saveConcurrencyPolicy,
  type ConcurrencyPolicyPatch,
  type InFlightSlot,
} from './concurrency-policy';
import { providerKindForTarget } from './execution-target-utils';
import {
  orderProjectsWeightedFair,
  pruneWeightedFairState,
  recordProjectServed,
  type WeightedFairState,
} from './weighted-fair-rr';
import {
  claimsAllowedThisTick,
  readCapabilityMaxConcurrentNovels,
  resolveConcurrentNovelCap,
} from '@shared/constants/scheduler-fairness';
import type { AiExecutionTarget } from '../ai/execution-target';
import { getCampaignPipelineOrchestrator } from '../campaign-pipeline/campaign-pipeline-orchestrator';

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
  /** Test override for capability max concurrent novels. */
  capabilityMaxConcurrentNovels?: number;
}

/**
 * Durable SQLite-backed scheduler.
 * - No in-memory-only queue
 * - ConcurrencyPolicy: global / per-provider / per-account / per-project(=1)
 * - Weighted fair project RR (priority weight, no starvation)
 * - Concurrent novels = min(capability, machine, READY profiles)
 * - Fair execution-target pick: priority, quota, LRU — not first DB row
 * - Chapter N finishes (+ memory) before N+1 of same project (per-project max 1)
 */
export class AutomationScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private shuttingDown = false;
  private readonly inFlight = new Set<string>();
  private readonly inFlightMeta = new Map<string, InFlightSlot>();
  /** Jobs force-requeued on stop — runJob must not continue DB writes. */
  private readonly abortedJobs = new Set<string>();
  private readonly runPromises = new Map<string, Promise<void>>();
  /** Weighted fair virtual-time state (not the job queue). */
  private readonly fairState: WeightedFairState = { served: new Map() };
  private readonly pool: ExecutionTargetPool;
  private readonly executor: BatchExecutor;
  private readonly leaseOwner: string;
  private readonly tickMs: number;
  private readonly leaseMs: number;
  private readonly policyOverrides: Partial<ConcurrencyPolicy>;
  private readonly capabilityMaxOverride?: number;

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
    this.capabilityMaxOverride = options.capabilityMaxConcurrentNovels;
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
      this.abortedJobs.add(jobId);
      try {
        if (!this.db.getConnection().open) continue;
        this.db.jobs.releaseLease(jobId);
        const job = this.db.jobs.getById(jobId);
        if (job && !['COMPLETED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELLED'].includes(job.state)) {
          this.db.jobs.updateState(jobId, 'QUEUED', 'Scheduler shutdown — requeued');
        }
        if (job?.worker_id) {
          this.db.workerStates.markReady(job.worker_id);
        }
      } catch (error) {
        logger.warn('Scheduler stop requeue skipped (DB closed)', {
          jobId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      this.inFlightMeta.delete(jobId);
    }
    this.inFlight.clear();
    this.running = false;

    // Await leftover runJob promises so they observe abort before DB teardown.
    const leftover = [...this.runPromises.values()];
    if (leftover.length > 0) {
      await Promise.race([
        Promise.allSettled(leftover),
        sleep(Math.min(2_000, Math.max(100, waitMs))),
      ]);
    }
    this.abortedJobs.clear();
    this.runPromises.clear();
  }

  pauseAll(reason = 'pause_all'): number {
    this.writeSetting(SCHEDULER_SETTING_KEYS.pauseAll, '1');
    return this.db.jobs.pauseAllQueued(reason);
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
    // Tests/shutdown may close SQLite while an unref'd interval still fires.
    if (!this.db.getConnection().open) return;

    this.db.jobs.recoverExpiredLeases();
    this.db.workerStates.clearExpiredLimits();
    // Cooldown/LIMITED workers cleared above — they never hold inFlight slots.
    this.db.jobs.reconcileDuplicateQueued();
    this.advanceCampaignPipelines();

    const policy = this.resolvePolicy();
    const busyAccountIds = this.busyAccountIds();
    const readyTargets = this.pool.listAvailable({ busyAccountIds });
    const machineMax = resolveGlobalMaxWorkers(
      policy,
      readyTargets.length + this.countBusyWorkers(),
    );
    const capabilityMax =
      this.capabilityMaxOverride ??
      readCapabilityMaxConcurrentNovels((k) => this.db.appMeta.get(k));
    const novelCap = resolveConcurrentNovelCap({
      capabilityMax,
      machineMax,
      readyProfiles: Math.max(readyTargets.length, 1),
    });
    let capacity = Math.min(machineMax, novelCap) - this.inFlight.size;
    if (capacity <= 0) return;

    const queueDepth = this.db.jobs.countRunnableQueued();
    capacity = Math.min(capacity, claimsAllowedThisTick({ capacity, queueDepth }));
    if (capacity <= 0) return;

    const weighted = this.db.jobs.listQueuedProjectWeights();
    pruneWeightedFairState(
      this.fairState,
      weighted.map((w) => w.projectId),
    );
    const projects = orderProjectsWeightedFair(weighted, this.fairState);
    if (projects.length === 0) return;

    const activeProjects = new Set(
      [...this.inFlightMeta.values()].map((s) => s.projectId),
    );
    let claimedThisTick = 0;

    for (let pass = 0; pass < projects.length && capacity > 0; pass += 1) {
      const projectId = projects[pass];
      let snap = buildConcurrencySnapshot(this.inFlightMeta.values());
      const projectMax = DEFAULT_PER_PROJECT_MAX;
      if ((snap.byProject.get(projectId) ?? 0) >= projectMax) continue;

      // Novel-level cap: do not start a new project when distinct novels at cap
      if (!activeProjects.has(projectId) && activeProjects.size >= novelCap) {
        continue;
      }

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
        activeProjects.add(job.project_id);
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
          activeProjects.delete(job.project_id);
          continue;
        }

        void this.runJob(job.id, target, profilePath);
        claimedThisTick += 1;
        capacity -= 1;
        busyAccountIds.add(target.concurrencyKey);
        recordProjectServed(this.fairState, projectId);
        break;
      }
    }

    void claimedThisTick;
  }

  /** Advance durable campaign stages when chapter jobs finish (resume-safe). */
  private advanceCampaignPipelines(): void {
    if (this.shuttingDown || !this.db.getConnection().open) return;
    try {
      const orchestrator = getCampaignPipelineOrchestrator(this.db);
      void orchestrator.resumeActive().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/not open|closed/i.test(message)) return;
        logger.warn('Campaign pipeline advance on scheduler tick failed', { message });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not open|closed/i.test(message)) return;
      logger.warn('Campaign pipeline advance on scheduler tick failed', { message });
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

  private resolvePolicy(): ConcurrencyPolicy {
    const loaded = loadConcurrencyPolicy(this.db);
    const merged: ConcurrencyPolicy = {
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

    if (merged.globalMaxWorkers === GLOBAL_MAX_MODE_AUTO) {
      const ready =
        this.pool.listAvailable().length + this.countBusyWorkers();
      const auto = resolveAutoConcurrencyCaps(ready);
      return {
        ...merged,
        autoCap: auto.autoCap,
        perProviderMax: auto.perProviderMax,
      };
    }

    return merged;
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
    const run = (async () => {
      try {
        if (this.shuttingDown || this.abortedJobs.has(jobId)) return;
        if (!this.db.getConnection().open) return;
        const fresh = this.db.jobs.getById(jobId);
        if (!fresh) return;

        await this.executor.execute({
          job: fresh,
          executionTarget: target,
          accountId: target.accountId,
          profilePath,
          leaseOwner: this.leaseOwner,
          shouldAbort: () =>
            this.shuttingDown ||
            this.abortedJobs.has(jobId) ||
            !this.db.getConnection().open,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/not open|closed/i.test(message)) {
          logger.warn('Scheduler job run aborted — database closed', { jobId, message });
          return;
        }
        logger.warn('Scheduler job run failed', { jobId, message });
      } finally {
        this.inFlight.delete(jobId);
        this.inFlightMeta.delete(jobId);
        this.runPromises.delete(jobId);
        this.abortedJobs.delete(jobId);
      }
    })();
    this.runPromises.set(jobId, run);
    await run;
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
