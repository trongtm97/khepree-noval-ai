import type { AutomationCommand, AutomationResult } from './protocol';
import type { BrowserState } from './types';

export interface BrowserWorkerInfo {
  workerId: string;
  state: BrowserState;
  profilePath: string | null;
}

/**
 * Abstraction over in-process or child_process browser automation.
 */
export interface BrowserWorker {
  readonly workerId: string;
  getState(): BrowserState;
  getProfilePath(): string | null;
  send(command: AutomationCommand): Promise<AutomationResult>;
  dispose(): Promise<void>;
}
