import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { BrowserState } from './types';
import type { AutomationCommand, AutomationResult } from './protocol';
import { AutomationError, RetryPolicy } from './errors/automation-errors';
import { captureFailureDiagnostics } from './diagnostics';
import type { AutomationErrorCode } from './types';

export interface BrowserSessionOptions {
  diagnosticsDir: string;
  retry?: RetryPolicy;
  defaultNavigationTimeoutMs?: number;
}

/**
 * Core Playwright session using launchPersistentContext(userDataDir).
 * No Gemini / Notebook selectors here.
 */
export class BrowserSession {
  private state: BrowserState = 'STOPPED';
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private profilePath: string | null = null;
  private headless = true;
  private diagnosticsDir: string;
  private readonly retry: RetryPolicy;
  private readonly defaultNavigationTimeoutMs: number;

  constructor(options: BrowserSessionOptions) {
    this.diagnosticsDir = options.diagnosticsDir;
    this.retry = options.retry ?? new RetryPolicy();
    this.defaultNavigationTimeoutMs = options.defaultNavigationTimeoutMs ?? 30_000;
  }

  getState(): BrowserState {
    return this.state;
  }

  getProfilePath(): string | null {
    return this.profilePath;
  }

  getPage(): Page | null {
    return this.page;
  }

  async execute(command: AutomationCommand): Promise<AutomationResult> {
    try {
      switch (command.type) {
        case 'OPEN':
          return await this.open(command);
        case 'NAVIGATE':
          return await this.navigate(command);
        case 'GET_STATUS':
          return this.status(command.id);
        case 'SCREENSHOT':
          return await this.screenshot(command);
        case 'CLOSE':
          return await this.close(command.id);
        case 'RESTART':
          return await this.restart(command);
        default: {
          const _exhaustive: never = command;
          return _exhaustive;
        }
      }
    } catch (error) {
      return this.failureFromError(command.id, command.type, error);
    }
  }

  private async open(
    command: Extract<AutomationCommand, { type: 'OPEN' }>,
  ): Promise<AutomationResult> {
    if (this.context) {
      await this.closeInternal();
    }

    this.state = 'STARTING';
    this.profilePath = path.resolve(command.profilePath);
    this.headless = command.headless ?? true;
    if (command.diagnosticsDir) {
      this.diagnosticsDir = command.diagnosticsDir;
    }

    fs.mkdirSync(this.profilePath, { recursive: true });
    fs.mkdirSync(this.diagnosticsDir, { recursive: true });

    try {
      const { chromium } = await import('playwright');
      this.context = await chromium.launchPersistentContext(this.profilePath, {
        headless: this.headless,
        // Never use channel:'chrome' — dedicated Chromium + userDataDir only
        args: ['--disable-blink-features=AutomationControlled'],
      });
      this.page = this.context.pages()[0] ?? (await this.context.newPage());

      if (command.startUrl) {
        await this.gotoWithRetry(command.startUrl, this.defaultNavigationTimeoutMs, 'OPEN');
      }

      this.state = 'READY';
      return {
        id: command.id,
        ok: true,
        state: this.state,
        data: {
          profilePath: this.profilePath,
          url: this.page.url(),
        },
      };
    } catch (error) {
      this.state = 'ERROR';
      throw error;
    }
  }

  private async navigate(
    command: Extract<AutomationCommand, { type: 'NAVIGATE' }>,
  ): Promise<AutomationResult> {
    this.assertReady('NAVIGATE');
    this.state = 'BUSY';
    await this.gotoWithRetry(
      command.url,
      command.timeoutMs ?? this.defaultNavigationTimeoutMs,
      'NAVIGATE',
    );
    await this.detectUserActionRequired();
    this.state = 'READY';
    return {
      id: command.id,
      ok: true,
      state: this.state,
      data: { url: this.page?.url() ?? null },
    };
  }

  private status(id: string): AutomationResult {
    return {
      id,
      ok: true,
      state: this.state,
      data: {
        profilePath: this.profilePath,
        url: this.page?.url() ?? null,
        hasContext: Boolean(this.context),
      },
    };
  }

  private async screenshot(
    command: Extract<AutomationCommand, { type: 'SCREENSHOT' }>,
  ): Promise<AutomationResult> {
    this.assertReady('SCREENSHOT');
    if (!this.page) {
      throw new AutomationError('UNKNOWN_UI', 'No page for screenshot');
    }

    fs.mkdirSync(this.diagnosticsDir, { recursive: true });
    const tag = command.tag ?? 'manual';
    const file = path.join(
      this.diagnosticsDir,
      `${tag.replace(/[^a-zA-Z0-9_-]+/g, '_')}-${Date.now()}.png`,
    );
    await this.page.screenshot({ path: file, fullPage: true });
    return {
      id: command.id,
      ok: true,
      state: this.state,
      data: { screenshotPath: file },
    };
  }

  private async close(id: string): Promise<AutomationResult> {
    await this.closeInternal();
    this.state = 'STOPPED';
    return { id, ok: true, state: this.state };
  }

  private async restart(
    command: Extract<AutomationCommand, { type: 'RESTART' }>,
  ): Promise<AutomationResult> {
    const profilePath = this.profilePath;
    if (!profilePath) {
      throw new AutomationError('UNKNOWN_UI', 'Cannot restart without an open profile');
    }
    const startUrl = command.startUrl ?? this.page?.url();
    await this.closeInternal();
    return this.open({
      id: command.id,
      type: 'OPEN',
      profilePath,
      headless: this.headless,
      startUrl: startUrl?.startsWith('http') ? startUrl : undefined,
      diagnosticsDir: this.diagnosticsDir,
    });
  }

  private async gotoWithRetry(
    url: string,
    timeoutMs: number,
    operationName: string,
  ): Promise<void> {
    await this.retry.run(
      operationName,
      async () => {
        if (!this.page) {
          throw new AutomationError('UNKNOWN_UI', 'No page available');
        }
        try {
          await this.page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
          });
        } catch (error) {
          throw await this.wrapNavigationError(error, operationName);
        }
      },
      (error) => this.classifyUnknown(error),
    );
  }

  private async wrapNavigationError(
    error: unknown,
    operationName: string,
  ): Promise<AutomationError> {
    const message = error instanceof Error ? error.message : String(error);
    let code: AutomationErrorCode = 'UNKNOWN_UI';

    if (/timeout/i.test(message)) {
      code = 'NAVIGATION_TIMEOUT';
    } else if (/net::|ERR_|NS_ERROR|network/i.test(message)) {
      code = 'NETWORK_ERROR';
    }

    const diagnostics = await captureFailureDiagnostics({
      page: this.page,
      diagnosticsDir: this.diagnosticsDir,
      operationName,
    });

    return new AutomationError(code, message, diagnostics);
  }

  private async detectUserActionRequired(): Promise<void> {
    if (!this.page) {
      return;
    }
    const url = this.page.url();
    const bodyText = await this.page.locator('body').innerText().catch(() => '');
    const html = await this.page.content().catch(() => '');

    if (
      /accounts\.google\.com/i.test(url) ||
      (await this.page.getByTestId('login-required').count()) > 0 ||
      /Sign in/i.test(bodyText)
    ) {
      this.state = 'USER_ACTION_REQUIRED';
      throw new AutomationError('LOGIN_REQUIRED', 'Login required');
    }
    if (
      (await this.page.getByTestId('captcha').count()) > 0 ||
      /captcha|unusual traffic|recaptcha/i.test(bodyText)
    ) {
      this.state = 'USER_ACTION_REQUIRED';
      throw new AutomationError('CAPTCHA', 'CAPTCHA / challenge detected');
    }
    if (
      (await this.page.getByTestId('session-expired').count()) > 0 ||
      /session expired/i.test(bodyText)
    ) {
      this.state = 'USER_ACTION_REQUIRED';
      throw new AutomationError('SESSION_EXPIRED', 'Session expired');
    }
    if (
      (await this.page.getByTestId('quota-limit').count()) > 0 ||
      /quota|rate limit/i.test(bodyText) ||
      /quota-limit/i.test(html)
    ) {
      throw new AutomationError('QUOTA_LIMIT', 'Quota limit detected');
    }
  }

  private assertReady(operation: string): void {
    if (!this.context || !this.page) {
      throw new AutomationError(
        'UNKNOWN_UI',
        `Browser not open for ${operation}`,
      );
    }
    if (this.state === 'STOPPED' || this.state === 'STARTING') {
      throw new AutomationError(
        'UNKNOWN_UI',
        `Browser state ${this.state} cannot run ${operation}`,
      );
    }
  }

  private async closeInternal(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // ignore close errors
      }
    }
    this.context = null;
    this.page = null;
  }

  private classifyUnknown(error: unknown): AutomationErrorCode {
    if (error instanceof AutomationError) {
      return error.code;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout/i.test(message)) return 'RESPONSE_TIMEOUT';
    if (/net::|network/i.test(message)) return 'NETWORK_ERROR';
    return 'UNKNOWN_UI';
  }

  private async failureFromError(
    id: string,
    operationName: string,
    error: unknown,
  ): Promise<AutomationResult> {
    const automationError =
      error instanceof AutomationError
        ? error
        : new AutomationError(
            this.classifyUnknown(error),
            error instanceof Error ? error.message : String(error),
          );

    const diagnostics =
      automationError.diagnostics ??
      (await captureFailureDiagnostics({
        page: this.page,
        diagnosticsDir: this.diagnosticsDir,
        operationName,
      }));

    if (
      automationError.code === 'LOGIN_REQUIRED' ||
      automationError.code === 'CAPTCHA' ||
      automationError.code === 'SESSION_EXPIRED'
    ) {
      this.state = 'USER_ACTION_REQUIRED';
    } else if (this.state !== 'STOPPED') {
      this.state = 'ERROR';
    }

    return {
      id,
      ok: false,
      state: this.state,
      errorCode: automationError.code,
      errorMessage: automationError.message,
      diagnostics,
    };
  }
}
