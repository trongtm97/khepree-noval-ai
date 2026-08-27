import type { BrowserContext, Page } from 'playwright';
import { AutomationError } from '../errors/automation-errors';
import type { LaunchPersistentContextResult } from '../browser-runner/launch-persistent-context';
import {
  BROWSER_RUNTIME_RECYCLE_EVERY_BATCHES,
  type RuntimeGenerationState,
  type RuntimeHealth,
} from '@shared/constants/browser-runtime';

export type LaunchContextFn = (input: {
  profilePath: string;
  headless?: boolean;
  diagnosticsDir: string;
}) => Promise<LaunchPersistentContextResult>;

export interface PlaywrightWorkerRuntimeOptions {
  accountId: string;
  profilePath: string;
  diagnosticsDir: string;
  launchFn: LaunchContextFn;
  recycleEveryBatches?: number;
  headless?: boolean;
  log?: (event: string, payload?: Record<string, unknown>) => void;
}

export interface PrepareNotebookInput {
  projectId: string;
  notebookUrl: string;
  /** Called to open/verify notebook on a fresh or switched project. */
  openNotebook: (page: Page, notebookUrl: string) => Promise<void>;
  /** Lightweight verify when same project already open. */
  verifyReady?: (page: Page) => Promise<void>;
}

/**
 * One Google account → one persistent BrowserContext across batches.
 */
export class PlaywrightWorkerRuntime {
  readonly accountId: string;
  readonly profilePath: string;
  readonly diagnosticsDir: string;

  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly launchFn: LaunchContextFn;
  private readonly recycleEveryBatches: number;
  private readonly headless?: boolean;
  private readonly log: (event: string, payload?: Record<string, unknown>) => void;

  currentProjectId: string | null = null;
  currentNotebookUrl: string | null = null;
  lastUsedAt = 0;
  health: RuntimeHealth = 'CLOSED';
  generationState: RuntimeGenerationState = 'IDLE';
  batchCount = 0;
  launchCount = 0;

  constructor(options: PlaywrightWorkerRuntimeOptions) {
    this.accountId = options.accountId;
    this.profilePath = options.profilePath;
    this.diagnosticsDir = options.diagnosticsDir;
    this.launchFn = options.launchFn;
    this.recycleEveryBatches =
      options.recycleEveryBatches ?? BROWSER_RUNTIME_RECYCLE_EVERY_BATCHES;
    this.headless = options.headless;
    this.log = options.log ?? (() => undefined);
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  getPage(): Page | null {
    return this.page;
  }

  isOpen(): boolean {
    return this.context != null && this.health !== 'CLOSED' && this.health !== 'CRASHED';
  }

  touch(): void {
    this.lastUsedAt = Date.now();
  }

  setGenerationState(state: RuntimeGenerationState): void {
    this.generationState = state;
  }

  async ensureContext(): Promise<Page> {
    if (this.context && this.page && !this.page.isClosed()) {
      this.health = this.health === 'NEEDS_ATTENTION' ? this.health : 'READY';
      this.touch();
      this.log('BROWSER_RUNTIME_REUSED', {
        accountId: this.accountId,
        launchCount: this.launchCount,
        batchCount: this.batchCount,
        projectId: this.currentProjectId,
      });
      return this.page;
    }

    if (this.context && this.page?.isClosed()) {
      return this.recoverPage();
    }

    if (this.context && !this.page) {
      return this.recoverPage();
    }

    await this.launchFresh('create');
    return this.requirePage();
  }

  private async launchFresh(reason: 'create' | 'recycle' | 'crash-relaunch'): Promise<void> {
    await this.closeContextOnly();
    const launched = await this.launchFn({
      profilePath: this.profilePath,
      headless: this.headless,
      diagnosticsDir: this.diagnosticsDir,
    });
    this.context = launched.context;
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    this.wireCrashHandlers();
    this.launchCount += 1;
    this.batchCount = reason === 'recycle' ? 0 : this.batchCount;
    this.health = 'READY';
    this.generationState = 'IDLE';
    this.currentProjectId = null;
    this.currentNotebookUrl = null;
    this.touch();

    const event =
      reason === 'recycle'
        ? 'BROWSER_RUNTIME_RECYCLED'
        : reason === 'crash-relaunch'
          ? 'BROWSER_RUNTIME_CRASHED'
          : 'BROWSER_RUNTIME_CREATED';
    this.log(event, {
      accountId: this.accountId,
      reason,
      launchCount: this.launchCount,
      profilePath: this.profilePath,
    });
  }

  private wireCrashHandlers(): void {
    const context = this.context;
    const page = this.page;
    if (!context || !page) return;

    page.on('crash', () => {
      this.log('BROWSER_RUNTIME_CRASHED', {
        accountId: this.accountId,
        scope: 'page',
      });
      this.health = 'CRASHED';
    });

    context.on('close', () => {
      if (this.health !== 'CLOSED') {
        this.log('BROWSER_RUNTIME_CRASHED', {
          accountId: this.accountId,
          scope: 'context',
        });
        this.health = 'CRASHED';
        this.context = null;
        this.page = null;
      }
    });
  }

  /** Page crash → new page on same context. */
  async recoverPage(): Promise<Page> {
    if (!this.context) {
      await this.launchFresh('crash-relaunch');
      return this.requirePage();
    }
    try {
      this.page = await this.context.newPage();
      this.health = 'READY';
      this.currentProjectId = null;
      this.currentNotebookUrl = null;
      this.touch();
      this.log('BROWSER_RUNTIME_CRASHED', {
        accountId: this.accountId,
        scope: 'page-recovered',
      });
      return this.page;
    } catch {
      await this.launchFresh('crash-relaunch');
      return this.requirePage();
    }
  }

  /** Context dead → relaunch persistent context. */
  async recoverContext(): Promise<Page> {
    await this.launchFresh('crash-relaunch');
    return this.requirePage();
  }

  async recycle(): Promise<Page> {
    await this.launchFresh('recycle');
    return this.requirePage();
  }

  /**
   * Same project → verify only.
   * Different project → navigate notebook then verify.
   */
  async prepareNotebook(input: PrepareNotebookInput): Promise<Page> {
    let page = await this.ensureContext();

    if (this.health === 'CRASHED' || page.isClosed()) {
      page = this.context ? await this.recoverPage() : await this.recoverContext();
    }

    const sameProject =
      this.currentProjectId === input.projectId &&
      this.currentNotebookUrl === input.notebookUrl;

    if (sameProject) {
      if (input.verifyReady) {
        await input.verifyReady(page);
      }
      this.touch();
      return page;
    }

    await input.openNotebook(page, input.notebookUrl);
    this.currentProjectId = input.projectId;
    this.currentNotebookUrl = input.notebookUrl;
    this.touch();
    return page;
  }

  markBatchCompleted(): void {
    this.batchCount += 1;
    this.generationState = 'IDLE';
    this.touch();
  }

  shouldRecycle(): boolean {
    return this.batchCount >= this.recycleEveryBatches;
  }

  markNeedsAttention(reason: string): void {
    this.health = 'NEEDS_ATTENTION';
    this.generationState = 'IDLE';
    this.log('BROWSER_RUNTIME_CRASHED', {
      accountId: this.accountId,
      scope: 'session',
      reason,
    });
  }

  async close(): Promise<void> {
    await this.closeContextOnly();
    this.health = 'CLOSED';
    this.generationState = 'IDLE';
    this.currentProjectId = null;
    this.currentNotebookUrl = null;
    this.log('BROWSER_RUNTIME_CLOSED', {
      accountId: this.accountId,
      launchCount: this.launchCount,
      batchCount: this.batchCount,
    });
  }

  private async closeContextOnly(): Promise<void> {
    const ctx = this.context;
    this.context = null;
    this.page = null;
    if (ctx) {
      await ctx.close().catch(() => undefined);
    }
  }

  private requirePage(): Page {
    if (!this.page || this.page.isClosed()) {
      throw new AutomationError('UNKNOWN_UI', 'PlaywrightWorkerRuntime has no live page');
    }
    return this.page;
  }
}
