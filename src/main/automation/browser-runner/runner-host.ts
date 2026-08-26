import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import type { BrowserWorker } from '../browser-worker';
import type { AutomationCommand, AutomationResult, RunnerOutboundMessage } from '../protocol';
import {
  parseAutomationResult,
  RunnerOutboundMessageSchema,
} from '../protocol';
import type { BrowserState } from '../types';
import { logger } from '../../logging/logger';

export interface ChildProcessBrowserWorkerOptions {
  workerId: string;
  runnerScriptPath: string;
  /** Electron binary or node. Prefer ELECTRON_RUN_AS_NODE=1 with process.execPath. */
  execPath?: string;
  env?: NodeJS.ProcessEnv;
}

interface PendingRequest {
  resolve: (result: AutomationResult) => void;
  reject: (error: Error) => void;
}

/**
 * BrowserWorker backed by a dedicated Node child_process (stdio JSON lines).
 */
export class ChildProcessBrowserWorker implements BrowserWorker {
  readonly workerId: string;
  private child: ChildProcessWithoutNullStreams | null = null;
  private state: BrowserState = 'STOPPED';
  private profilePath: string | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly runnerScriptPath: string;
  private readonly execPath: string;
  private readonly env: NodeJS.ProcessEnv;
  private starting: Promise<void> | null = null;

  constructor(options: ChildProcessBrowserWorkerOptions) {
    this.workerId = options.workerId;
    this.runnerScriptPath = options.runnerScriptPath;
    this.execPath = options.execPath ?? process.execPath;
    this.env = {
      ...process.env,
      ...options.env,
      ELECTRON_RUN_AS_NODE: '1',
    };
  }

  getState(): BrowserState {
    return this.state;
  }

  getProfilePath(): string | null {
    return this.profilePath;
  }

  async send(command: AutomationCommand): Promise<AutomationResult> {
    await this.ensureStarted();
    if (!this.child?.stdin.writable) {
      throw new Error('Browser runner child process is not writable');
    }

    const resultPromise = new Promise<AutomationResult>((resolve, reject) => {
      this.pending.set(command.id, { resolve, reject });
    });

    this.child.stdin.write(`${JSON.stringify(command)}\n`);
    const result = await resultPromise;
    this.state = result.state;
    if (typeof result.data?.profilePath === 'string') {
      this.profilePath = result.data.profilePath;
    }
    return result;
  }

  async dispose(): Promise<void> {
    if (this.child) {
      try {
        await this.send({ id: `close-${Date.now()}`, type: 'CLOSE' });
      } catch {
        // ignore
      }
      this.child.kill();
      this.child = null;
    }
    for (const [, pending] of this.pending) {
      pending.reject(new Error('Browser worker disposed'));
    }
    this.pending.clear();
    this.state = 'STOPPED';
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && !this.child.killed) {
      return;
    }
    if (this.starting) {
      await this.starting;
      return;
    }

    this.starting = new Promise<void>((resolve, reject) => {
      try {
        this.state = 'STARTING';
        const child = spawn(this.execPath, [this.runnerScriptPath], {
          env: this.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.child = child;

        const rl = readline.createInterface({ input: child.stdout });
        rl.on('line', (line) => {
          this.handleLine(line);
        });

        child.stderr.on('data', (chunk: Buffer) => {
          logger.warn('Browser runner stderr', {
            workerId: this.workerId,
            chunk: chunk.toString('utf8').slice(0, 500),
          });
        });

        child.on('error', (error) => {
          this.failAll(error);
          reject(error);
        });

        child.on('exit', (code) => {
          this.child = null;
          this.state = 'STOPPED';
          this.failAll(new Error(`Browser runner exited with code ${code}`));
        });

        // Runner prints a ready event on boot
        const bootTimer = setTimeout(() => {
          resolve();
        }, 200);

        child.stdout.once('data', () => {
          clearTimeout(bootTimer);
          resolve();
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private handleLine(line: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(line) as unknown;
    } catch {
      logger.warn('Invalid JSON from browser runner', { line: line.slice(0, 200) });
      return;
    }

    let message: RunnerOutboundMessage;
    try {
      message = RunnerOutboundMessageSchema.parse(raw);
    } catch {
      logger.warn('Invalid runner message', { line: line.slice(0, 200) });
      return;
    }

    if (message.kind === 'result') {
      const result = parseAutomationResult(message.result);
      const pending = this.pending.get(result.id);
      if (pending) {
        this.pending.delete(result.id);
        pending.resolve(result);
      }
      return;
    }

    if (message.kind === 'event' && message.event === 'runner_ready') {
      this.state = 'READY';
    }
  }

  private failAll(error: Error): void {
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export function resolveDefaultRunnerScriptPath(): string {
  // Built next to main.js by Electron Forge Vite plugin from runner-entry.ts
  return path.join(__dirname, 'runner-entry.js');
}
