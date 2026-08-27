import { utilityProcess, type UtilityProcess } from 'electron';
import type { BrowserWorker } from '../browser-worker';
import type {
  AutomationCommand,
  AutomationResult,
  RunnerChildToHostMessage,
  RunnerHostToChildMessage,
} from '../protocol';
import { parseRunnerChildToHostMessage } from '../protocol';
import type { BrowserState } from '../types';
import { logger } from '../../logging/logger';
import { resolveRunnerScriptPath } from './runner-path';

export interface UtilityProcessBrowserWorkerOptions {
  workerId: string;
  runnerScriptPath: string;
  env?: NodeJS.ProcessEnv;
  /** Per-request timeout (default 120s). */
  requestTimeoutMs?: number;
  /** Wait for runner_ready after fork (default 15s). */
  readyTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (result: AutomationResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * BrowserWorker backed by Electron utilityProcess.fork().
 * Works with RunAsNode=false (no ELECTRON_RUN_AS_NODE).
 */
export class UtilityProcessBrowserWorker implements BrowserWorker {
  readonly workerId: string;
  private child: UtilityProcess | null = null;
  private state: BrowserState = 'STOPPED';
  private profilePath: string | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly runnerScriptPath: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly requestTimeoutMs: number;
  private readonly readyTimeoutMs: number;
  private starting: Promise<void> | null = null;
  private disposed = false;

  constructor(options: UtilityProcessBrowserWorkerOptions) {
    this.workerId = options.workerId;
    this.runnerScriptPath = options.runnerScriptPath;
    this.env = {
      ...process.env,
      ...options.env,
    };
    // Never set ELECTRON_RUN_AS_NODE — fuse is false in packaged builds.
    delete this.env.ELECTRON_RUN_AS_NODE;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 15_000;
  }

  getState(): BrowserState {
    return this.state;
  }

  getProfilePath(): string | null {
    return this.profilePath;
  }

  async send(command: AutomationCommand): Promise<AutomationResult> {
    if (this.disposed) {
      throw new Error('Browser worker disposed');
    }
    await this.ensureStarted();
    if (!this.child) {
      throw new Error('Browser runner utility process is not running');
    }

    const requestId = command.id;
    const resultPromise = new Promise<AutomationResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            `Browser runner timeout after ${this.requestTimeoutMs}ms (${command.type})`,
          ),
        );
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
    });

    const message: RunnerHostToChildMessage = {
      type: 'request',
      requestId,
      command,
    };
    this.child.postMessage(message);
    const result = await resultPromise;
    this.state = result.state;
    if (typeof result.data?.profilePath === 'string') {
      this.profilePath = result.data.profilePath;
    }
    return result;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.child) {
      try {
        await this.sendCloseBestEffort();
      } catch {
        // ignore
      }
      try {
        this.child.kill();
      } catch {
        // ignore
      }
      this.child = null;
    }
    this.failAll(new Error('Browser worker disposed'));
    this.state = 'STOPPED';
  }

  /** Kill and clear so next send() respawns a fresh utility process. */
  async restart(): Promise<void> {
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
      this.child = null;
    }
    this.failAll(new Error('Browser runner restarted'));
    this.state = 'STOPPED';
    this.disposed = false;
    await this.ensureStarted();
  }

  private async sendCloseBestEffort(): Promise<void> {
    if (!this.child) return;
    const requestId = `close-${Date.now()}`;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2_000);
      this.pending.set(requestId, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: () => {
          clearTimeout(timer);
          resolve();
        },
        timer,
      });
      try {
        this.child?.postMessage({
          type: 'request',
          requestId,
          command: { id: requestId, type: 'CLOSE' },
        } satisfies RunnerHostToChildMessage);
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve();
      }
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.child) {
      return;
    }
    if (this.starting) {
      await this.starting;
      return;
    }

    this.starting = this.spawnChild();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private spawnChild(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.state = 'STARTING';
        logger.info('Spawning browser runner utility process', {
          workerId: this.workerId,
          runnerScriptPath: this.runnerScriptPath,
        });

        const child = utilityProcess.fork(this.runnerScriptPath, [], {
          serviceName: `NovelTransBrowserRunner:${this.workerId}`,
          env: this.env,
          stdio: 'pipe',
        });
        this.child = child;

        let settled = false;
        const readyTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          const err = new Error(
            `Browser runner ready timeout after ${this.readyTimeoutMs}ms (${this.runnerScriptPath})`,
          );
          this.failAll(err);
          try {
            child.kill();
          } catch {
            // ignore
          }
          this.child = null;
          this.state = 'ERROR';
          reject(err);
        }, this.readyTimeoutMs);

        child.on('message', (raw) => {
          this.handleMessage(raw);
          if (!settled) {
            try {
              const msg = parseRunnerChildToHostMessage(raw);
              if (msg.type === 'event' && msg.event === 'runner_ready') {
                settled = true;
                clearTimeout(readyTimer);
                this.state = 'READY';
                resolve();
              }
            } catch {
              // ignore until typed ready
            }
          }
        });

        child.stderr?.on('data', (chunk: Buffer) => {
          logger.warn('Browser runner stderr', {
            workerId: this.workerId,
            chunk: chunk.toString('utf8').slice(0, 500),
          });
        });

        child.on('exit', (code) => {
          const wasCurrent = this.child === child;
          if (wasCurrent) {
            this.child = null;
            this.state = 'STOPPED';
          }
          const err = new Error(
            `Browser runner crashed/exited with code ${code ?? 'null'}`,
          );
          this.failAll(err);
          if (!settled) {
            settled = true;
            clearTimeout(readyTimer);
            reject(err);
          }
        });
      } catch (error) {
        this.state = 'ERROR';
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private handleMessage(raw: unknown): void {
    let message: RunnerChildToHostMessage;
    try {
      message = parseRunnerChildToHostMessage(raw);
    } catch {
      logger.warn('Invalid runner utilityProcess message', {
        preview: JSON.stringify(raw).slice(0, 200),
      });
      return;
    }

    if (message.type === 'response') {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      clearTimeout(pending.timer);
      if (message.error && !message.result) {
        pending.reject(
          new Error(
            message.error.code
              ? `${message.error.code}: ${message.error.message}`
              : message.error.message,
          ),
        );
        return;
      }
      if (message.result) {
        pending.resolve(message.result);
        return;
      }
      pending.reject(new Error('Browser runner response missing result'));
      return;
    }

    if (message.type === 'event' && message.event === 'runner_ready') {
      this.state = 'READY';
      return;
    }

    if (message.type === 'log') {
      const level = message.level;
      if (level === 'error') {
        logger.error('Browser runner log', { message: message.message });
      } else if (level === 'warn') {
        logger.warn('Browser runner log', { message: message.message });
      } else {
        logger.info('Browser runner log', { message: message.message });
      }
    }
  }

  private failAll(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

/** @deprecated Use UtilityProcessBrowserWorker — alias kept for imports. */
export const ChildProcessBrowserWorker = UtilityProcessBrowserWorker;
export type ChildProcessBrowserWorkerOptions = UtilityProcessBrowserWorkerOptions;

export function resolveDefaultRunnerScriptPath(): string {
  return resolveRunnerScriptPath(__dirname);
}
