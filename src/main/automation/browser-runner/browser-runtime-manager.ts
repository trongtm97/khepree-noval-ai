import {
  BROWSER_RUNTIME_IDLE_SWEEP_MS,
  BROWSER_RUNTIME_IDLE_TIMEOUT_MS,
  BROWSER_RUNTIME_RECYCLE_EVERY_BATCHES,
  runtimeLockOwner,
} from '@shared/constants/browser-runtime';
import { PROFILE_LEASE_TTL_MS } from '@shared/constants/profile-lease';
import { profileLockManager, startLeaseHeartbeat } from './profile-lock';
import {
  PlaywrightWorkerRuntime,
  type LaunchContextFn,
  type PrepareNotebookInput,
} from './playwright-worker-runtime';
import { launchNovelTransPersistentContext } from './launch-persistent-context';
import { logger } from '../../logging/logger';
import { AutomationError } from '../errors/automation-errors';

export interface BrowserRuntimeManagerOptions {
  idleTimeoutMs?: number;
  recycleEveryBatches?: number;
  idleSweepMs?: number;
  launchFn?: LaunchContextFn;
  /** Disable background idle sweeper (tests). */
  disableIdleSweeper?: boolean;
  now?: () => number;
  log?: (event: string, payload?: Record<string, unknown>) => void;
}

export interface RunExclusiveInput {
  accountId: string;
  profilePath: string;
  diagnosticsDir: string;
  headless?: boolean;
  jobId?: string | null;
  /**
   * When true, caller already holds job:/runtime: lock — do not acquire/release
   * the long-lived runtime lock around this call (nested op).
   */
  nestUnderExternalLock?: boolean;
}

export interface ExclusiveRuntimeHandle {
  runtime: PlaywrightWorkerRuntime;
  prepareNotebook: (input: PrepareNotebookInput) => Promise<import('playwright').Page>;
}

type MutexTail = Promise<unknown>;

/**
 * 1 Google account → 1 PlaywrightWorkerRuntime → 1 persistent BrowserContext.
 * Serializes AI browser operations per account; reuses context across batches.
 */
export class BrowserRuntimeManager {
  private readonly runtimes = new Map<string, PlaywrightWorkerRuntime>();
  private readonly mutexTails = new Map<string, MutexTail>();
  private readonly runtimeHeartbeats = new Map<string, () => void>();
  private readonly idleTimeoutMs: number;
  private readonly recycleEveryBatches: number;
  private readonly launchFn: LaunchContextFn;
  private readonly now: () => number;
  private readonly log: (event: string, payload?: Record<string, unknown>) => void;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private shutDown = false;

  /** Test/metrics: total launchPersistentContext invocations. */
  totalLaunchCount = 0;

  constructor(options: BrowserRuntimeManagerOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? BROWSER_RUNTIME_IDLE_TIMEOUT_MS;
    this.recycleEveryBatches =
      options.recycleEveryBatches ?? BROWSER_RUNTIME_RECYCLE_EVERY_BATCHES;
    this.now = options.now ?? Date.now;
    this.log =
      options.log ??
      ((event, payload) => {
        logger.info(event, payload);
      });
    this.launchFn =
      options.launchFn ??
      (async (input) => {
        this.totalLaunchCount += 1;
        return launchNovelTransPersistentContext({
          profilePath: input.profilePath,
          headless: input.headless,
          headlessDefault: false,
          diagnosticsDir: input.diagnosticsDir,
        });
      });

    if (!options.disableIdleSweeper) {
      this.idleTimer = setInterval(() => {
        void this.sweepIdle();
      }, options.idleSweepMs ?? BROWSER_RUNTIME_IDLE_SWEEP_MS);
      if (typeof this.idleTimer === 'object' && 'unref' in this.idleTimer) {
        this.idleTimer.unref();
      }
    }
  }

  getRuntime(accountId: string): PlaywrightWorkerRuntime | undefined {
    return this.runtimes.get(accountId);
  }

  getLaunchCount(accountId: string): number {
    return this.runtimes.get(accountId)?.launchCount ?? 0;
  }

  /**
   * Exclusive AI browser operation for one account.
   * Ensures at most one concurrent op; reuses persistent context across calls.
   */
  async runExclusive<T>(
    input: RunExclusiveInput,
    fn: (handle: ExclusiveRuntimeHandle) => Promise<T>,
  ): Promise<T> {
    if (this.shutDown) {
      throw new AutomationError('UNKNOWN_UI', 'BrowserRuntimeManager is shut down');
    }

    return this.withMutex(input.accountId, async () => {
      const runtime = await this.ensureRuntime(input);
      if (runtime.health === 'NEEDS_ATTENTION') {
        throw new AutomationError(
          'SESSION_EXPIRED',
          'Browser runtime NEEDS_ATTENTION — re-login required',
        );
      }

      runtime.health = 'BUSY';
      runtime.touch();
      try {
        const handle: ExclusiveRuntimeHandle = {
          runtime,
          prepareNotebook: (prep) => runtime.prepareNotebook(prep),
        };
        const result = await fn(handle);

        runtime.markBatchCompleted();
        if (runtime.shouldRecycle()) {
          await runtime.recycle();
        } else {
          runtime.health = 'READY';
        }
        return result;
      } catch (error) {
        await this.handleOperationError(runtime, error);
        throw error;
      }
    });
  }

  private async ensureRuntime(input: RunExclusiveInput): Promise<PlaywrightWorkerRuntime> {
    let runtime = this.runtimes.get(input.accountId);
    if (!runtime) {
      runtime = new PlaywrightWorkerRuntime({
        accountId: input.accountId,
        profilePath: input.profilePath,
        diagnosticsDir: input.diagnosticsDir,
        headless: input.headless,
        recycleEveryBatches: this.recycleEveryBatches,
        launchFn: async (launchInput) => this.launchFn(launchInput),
        log: this.log,
      });
      this.runtimes.set(input.accountId, runtime);
    }

    const lockOwner = runtimeLockOwner(input.accountId);
    const holdsRuntimeLock = profileLockManager.isHeldByRuntime(
      input.profilePath,
      input.accountId,
    );

    if (!runtime.isOpen()) {
      // Need exclusive profile for launch. Prefer runtime lock; nest under job lock
      // only for the launch moment, then take over as runtime: owner when possible.
      if (!holdsRuntimeLock) {
        if (profileLockManager.canNestLaunch(input.profilePath, {
          accountId: input.accountId,
          jobId: input.jobId,
        })) {
          // Nested under job:/runtime: — launch without second acquire.
        } else if (profileLockManager.isLocked(input.profilePath)) {
          throw new Error(
            `Browser profile already in use by ${profileLockManager.getOwner(input.profilePath)}. Never open two Playwright instances on the same userDataDir.`,
          );
        } else {
          profileLockManager.acquireLease({
            profilePath: input.profilePath,
            ownerId: lockOwner,
            accountId: input.accountId,
            operation: 'runtime',
            label: 'Browser runtime persistent',
            // Long-lived between batches; heartbeat renews.
            ttlMs: Math.max(PROFILE_LEASE_TTL_MS, this.idleTimeoutMs),
          });
          this.ensureRuntimeHeartbeat(input.accountId, input.profilePath, lockOwner);
        }
      }

      await runtime.ensureContext();

      // After nesting under a job lock, claim runtime ownership for persistence
      // beyond the job if the job lock is still the only owner.
      if (
        !profileLockManager.isHeldByRuntime(input.profilePath, input.accountId) &&
        profileLockManager.isHeldByJob(input.profilePath, input.jobId)
      ) {
        // Keep nesting for this job; on closeRuntime we only release runtime owners.
        // Persist ownership by upgrading when job releases — handled in adoptRuntimeLock.
        this.pendingRuntimeAdopt.add(input.accountId);
      }
    } else {
      await runtime.ensureContext();
    }

    return runtime;
  }

  /** Accounts that launched under a job lock and need runtime: lock after job releases. */
  private readonly pendingRuntimeAdopt = new Set<string>();

  /** Call after job profile lock release so persistent context keeps exclusive ownership. */
  adoptRuntimeLockIfNeeded(accountId: string, profilePath: string): void {
    if (!this.pendingRuntimeAdopt.has(accountId)) return;
    const runtime = this.runtimes.get(accountId);
    if (!runtime?.isOpen()) {
      this.pendingRuntimeAdopt.delete(accountId);
      return;
    }
    if (profileLockManager.isLocked(profilePath)) return;
    try {
      profileLockManager.acquireLease({
        profilePath,
        ownerId: runtimeLockOwner(accountId),
        accountId,
        operation: 'runtime',
        label: 'Browser runtime persistent',
        ttlMs: Math.max(PROFILE_LEASE_TTL_MS, this.idleTimeoutMs),
      });
      this.ensureRuntimeHeartbeat(accountId, profilePath, runtimeLockOwner(accountId));
      this.pendingRuntimeAdopt.delete(accountId);
    } catch {
      // Another owner raced — next exclusive op will surface the conflict.
    }
  }

  private ensureRuntimeHeartbeat(
    accountId: string,
    profilePath: string,
    ownerId: string,
  ): void {
    if (this.runtimeHeartbeats.has(accountId)) return;
    this.runtimeHeartbeats.set(
      accountId,
      startLeaseHeartbeat(profileLockManager, {
        profilePath,
        ownerId,
        ttlMs: Math.max(PROFILE_LEASE_TTL_MS, this.idleTimeoutMs),
      }),
    );
  }

  private stopRuntimeHeartbeat(accountId: string): void {
    const stop = this.runtimeHeartbeats.get(accountId);
    if (stop) {
      stop();
      this.runtimeHeartbeats.delete(accountId);
    }
  }

  private async handleOperationError(
    runtime: PlaywrightWorkerRuntime,
    error: unknown,
  ): Promise<void> {
    const code =
      error instanceof AutomationError
        ? error.code
        : error instanceof Error
          ? error.message
          : String(error);

    if (
      code === 'SESSION_EXPIRED' ||
      code === 'LOGIN_REQUIRED' ||
      (typeof code === 'string' && /SESSION_EXPIRED|LOGIN_REQUIRED/i.test(code))
    ) {
      runtime.markNeedsAttention(code);
      return;
    }

    const pageDead = !runtime.getPage() || runtime.getPage()?.isClosed();
    const contextDead = !runtime.getContext();
    if (contextDead || runtime.health === 'CRASHED') {
      try {
        await runtime.recoverContext();
        runtime.health = 'READY';
      } catch {
        runtime.health = 'CRASHED';
      }
      return;
    }
    if (pageDead) {
      try {
        await runtime.recoverPage();
        runtime.health = 'READY';
      } catch {
        runtime.health = 'CRASHED';
      }
    } else if (runtime.health === 'BUSY') {
      runtime.health = 'READY';
    }
  }

  private withMutex<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.mutexTails.get(accountId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => fn());
    this.mutexTails.set(
      accountId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  async sweepIdle(): Promise<void> {
    const now = this.now();
    for (const [accountId, runtime] of this.runtimes) {
      if (runtime.health === 'BUSY') continue;
      if (!runtime.isOpen()) continue;
      if (now - runtime.lastUsedAt < this.idleTimeoutMs) continue;
      await this.closeRuntime(accountId, 'idle');
    }
  }

  async closeRuntime(accountId: string, reason = 'manual'): Promise<void> {
    const runtime = this.runtimes.get(accountId);
    if (!runtime) return;
    const profilePath = runtime.profilePath;
    this.stopRuntimeHeartbeat(accountId);
    await runtime.close();
    this.runtimes.delete(accountId);
    if (profileLockManager.isHeldByRuntime(profilePath, accountId)) {
      try {
        profileLockManager.releaseLease(profilePath, runtimeLockOwner(accountId));
      } catch {
        profileLockManager.recoverIfStale(profilePath);
      }
    }
    this.log('BROWSER_RUNTIME_CLOSED', { accountId, reason, via: 'manager' });
  }

  /**
   * Evict runtime before another subsystem (AccountWorker / Notebook) launches
   * its own context on the same profile.
   */
  async evictForExternalLaunch(accountId: string): Promise<void> {
    await this.closeRuntime(accountId, 'evict-external');
  }

  async shutdownAll(): Promise<void> {
    this.shutDown = true;
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    const ids = [...this.runtimes.keys()];
    for (const id of ids) {
      await this.closeRuntime(id, 'shutdown');
    }
  }

  /** Test helper — reset singleton-friendly state without process exit. */
  async resetForTests(): Promise<void> {
    await this.shutdownAll();
    this.shutDown = false;
    this.totalLaunchCount = 0;
    this.mutexTails.clear();
    if (!this.idleTimer) {
      // leave sweeper off if it was disabled
    }
  }
}

let singleton: BrowserRuntimeManager | null = null;

export function getBrowserRuntimeManager(): BrowserRuntimeManager {
  singleton ??= new BrowserRuntimeManager();
  return singleton;
}

export function initializeBrowserRuntimeManager(
  options?: BrowserRuntimeManagerOptions,
): BrowserRuntimeManager {
  singleton = new BrowserRuntimeManager(options);
  return singleton;
}

export async function shutdownBrowserRuntimeManager(): Promise<void> {
  if (!singleton) return;
  await singleton.shutdownAll();
  singleton = null;
}

export function resetBrowserRuntimeManagerForTests(): void {
  singleton = null;
}
