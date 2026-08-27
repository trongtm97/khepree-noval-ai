import path from 'node:path';
import type { AutomationCommand, AutomationResult } from './protocol';
import type { BrowserWorker } from './browser-worker';
import {
  InProcessBrowserWorker,
  defaultDiagnosticsDir,
} from './in-process-browser-worker';
import {
  UtilityProcessBrowserWorker,
  resolveDefaultRunnerScriptPath,
} from './browser-runner/runner-host';
import { profileLockManager, type ProfileLockManager } from './browser-runner/profile-lock';
import type { BrowserState } from './types';
import { newId } from '../db/utils/uuid';

export type WorkerTransport = 'in-process' | 'child-process' | 'utility-process';

export interface AutomationManagerOptions {
  cacheDir: string;
  transport?: WorkerTransport;
  locks?: ProfileLockManager;
  runnerScriptPath?: string;
  /** @deprecated Ignored — utilityProcess.fork does not use execPath / RunAsNode. */
  execPath?: string;
}

export interface OpenWorkerOptions {
  workerId: string;
  profilePath: string;
  headless?: boolean;
  startUrl?: string;
}

/**
 * Owns BrowserWorkers. One worker per account profile.
 * Provider (Gemini) logic stays outside — AutomationProvider attaches later.
 */
export class AutomationManager {
  private readonly workers = new Map<string, BrowserWorker>();
  private readonly cacheDir: string;
  private readonly transport: WorkerTransport;
  private readonly locks: ProfileLockManager;
  private readonly runnerScriptPath: string;

  constructor(options: AutomationManagerOptions) {
    this.cacheDir = options.cacheDir;
    this.transport = options.transport ?? 'utility-process';
    this.locks = options.locks ?? profileLockManager;
    this.runnerScriptPath =
      options.runnerScriptPath ?? resolveDefaultRunnerScriptPath();
  }

  listWorkers(): { workerId: string; state: BrowserState; profilePath: string | null }[] {
    return [...this.workers.values()].map((worker) => ({
      workerId: worker.workerId,
      state: worker.getState(),
      profilePath: worker.getProfilePath(),
    }));
  }

  getWorker(workerId: string): BrowserWorker | null {
    return this.workers.get(workerId) ?? null;
  }

  async openWorker(options: OpenWorkerOptions): Promise<AutomationResult> {
    const existing = this.workers.get(options.workerId);
    if (existing) {
      await existing.dispose();
      this.workers.delete(options.workerId);
      try {
        this.locks.releaseLease(options.profilePath, options.workerId);
      } catch {
        this.locks.recoverIfStale(options.profilePath);
      }
    }

    this.locks.acquireLease({
      profilePath: options.profilePath,
      ownerId: options.workerId,
      accountId: options.workerId,
      operation: 'manual_browser',
      label: 'Automation worker',
    });

    const diagnosticsDir = defaultDiagnosticsDir(this.cacheDir, options.workerId);
    const useUtility =
      this.transport === 'child-process' || this.transport === 'utility-process';
    const worker = !useUtility
      ? new InProcessBrowserWorker({
          workerId: options.workerId,
          diagnosticsDir,
        })
      : new UtilityProcessBrowserWorker({
          workerId: options.workerId,
          runnerScriptPath: this.runnerScriptPath,
          env: {
            NOVELTRANS_AUTOMATION_DIAGNOSTICS_DIR: diagnosticsDir,
          },
        });

    this.workers.set(options.workerId, worker);

    try {
      const result = await worker.send({
        id: newId(),
        type: 'OPEN',
        profilePath: options.profilePath,
        headless: options.headless,
        startUrl: options.startUrl,
        diagnosticsDir,
      });
      if (!result.ok) {
        await this.closeWorker(options.workerId);
      }
      return result;
    } catch (error) {
      await this.closeWorker(options.workerId);
      throw error;
    }
  }

  async sendCommand(
    workerId: string,
    command: AutomationCommand,
  ): Promise<AutomationResult> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`No automation worker for ${workerId}`);
    }
    return worker.send(command);
  }

  async closeWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }
    const profilePath = worker.getProfilePath();
    try {
      await worker.dispose();
    } finally {
      this.workers.delete(workerId);
      if (profilePath) {
        try {
          this.locks.releaseLease(profilePath, workerId);
        } catch {
          this.locks.recoverIfStale(profilePath);
        }
      }
    }
  }

  async disposeAll(): Promise<void> {
    const ids = [...this.workers.keys()];
    for (const id of ids) {
      await this.closeWorker(id);
    }
  }
}

export function resolveAutomationCacheDir(cacheRoot: string): string {
  return path.join(cacheRoot, 'automation');
}
