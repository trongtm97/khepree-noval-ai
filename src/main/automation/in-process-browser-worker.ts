import path from 'node:path';
import { BrowserSession } from './browser-session';
import type { BrowserWorker } from './browser-worker';
import type { AutomationCommand, AutomationResult } from './protocol';
import type { BrowserState } from './types';
import { RetryPolicy } from './errors/automation-errors';

export interface InProcessBrowserWorkerOptions {
  workerId: string;
  diagnosticsDir: string;
  retry?: RetryPolicy;
}

/**
 * Same command protocol as child runner, executed in-process (tests / simple hosts).
 */
export class InProcessBrowserWorker implements BrowserWorker {
  readonly workerId: string;
  private readonly session: BrowserSession;

  constructor(options: InProcessBrowserWorkerOptions) {
    this.workerId = options.workerId;
    this.session = new BrowserSession({
      diagnosticsDir: options.diagnosticsDir,
      retry: options.retry,
    });
  }

  getState(): BrowserState {
    return this.session.getState();
  }

  getProfilePath(): string | null {
    return this.session.getProfilePath();
  }

  send(command: AutomationCommand): Promise<AutomationResult> {
    return this.session.execute(command);
  }

  async dispose(): Promise<void> {
    await this.session.execute({
      id: `dispose-${Date.now()}`,
      type: 'CLOSE',
    });
  }
}

export function defaultDiagnosticsDir(cacheRoot: string, workerId: string): string {
  return path.join(cacheRoot, 'automation', workerId);
}
