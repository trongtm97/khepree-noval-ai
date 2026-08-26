import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import type { AutomationProvider, AutomationProviderHealth } from '../automation-provider';
import type { BrowserSession } from '../../browser-session';
import { AutomationError } from '../../errors/automation-errors';
import { captureFailureDiagnostics } from '../../diagnostics';
import type { AutomationErrorCode } from '../../types';
import { BrowserEventLogger } from '../../browser-event-logger';
import {
  DEFAULT_DOM_POLL_INTERVAL_MS,
  DEFAULT_GENERATION_MAX_TIMEOUT_MS,
  DEFAULT_STABILIZATION_WINDOW_MS,
  formatCorrelationMarker,
  GEMINI_URL,
  NOTEBOOKLM_URL,
} from '@shared/constants/gemini';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import {
  appendPlaywrightProtocolNudge,
  sanitizeNotebookAssistantText,
} from '@shared/utils/notebook-response-sanitize';
import {
  composerFillLooksValid,
  readComposerCharCount,
  setAngularComposerValue,
} from '@shared/utils/notebook-composer-fill';
import { GeminiSelectorRegistry } from './selectors/google-gemini.selectors';
import { waitForDomState, waitForStableResponse } from './response-stabilizer';
import { newId } from '../../../db/utils/uuid';

export type UserActionKind = 'LOGIN_REQUIRED' | 'CAPTCHA' | 'QUOTA_LIMIT';

export interface GeminiBrowserProviderOptions {
  diagnosticsDir: string;
  baseUrl?: string;
  eventLogger?: BrowserEventLogger;
  workerId?: string | null;
  jobId?: string | null;
  maxTimeoutMs?: number;
  stabilizationWindowMs?: number;
}

export interface GeminiRawResponse {
  correlationId: string;
  text: string;
  capturedAt: string;
}

/**
 * Gemini / NotebookLM chat provider via Playwright.
 * Returns raw model text only — no OUTPUT_PROTOCOL parsing here.
 */
export class GeminiBrowserProvider implements AutomationProvider {
  readonly providerId = 'google-gemini';
  private page: Page | null = null;
  private session: BrowserSession | null = null;
  private selectors: GeminiSelectorRegistry | null = null;
  private readonly diagnosticsDir: string;
  private readonly baseUrl: string;
  private readonly eventLogger: BrowserEventLogger | null;
  private readonly workerId: string | null;
  private readonly jobId: string | null;
  private readonly maxTimeoutMs: number;
  private readonly stabilizationWindowMs: number;
  private activeCorrelationId: string | null = null;
  private cancelled = false;

  constructor(options: GeminiBrowserProviderOptions) {
    this.diagnosticsDir = options.diagnosticsDir;
    this.baseUrl = options.baseUrl ?? GEMINI_URL;
    this.eventLogger = options.eventLogger ?? null;
    this.workerId = options.workerId ?? null;
    this.jobId = options.jobId ?? null;
    this.maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_GENERATION_MAX_TIMEOUT_MS;
    this.stabilizationWindowMs =
      options.stabilizationWindowMs ?? DEFAULT_STABILIZATION_WINDOW_MS;
  }

  attachPage(page: Page): void {
    this.page = page;
    this.selectors = new GeminiSelectorRegistry(page, this.diagnosticsDir);
  }

  async attach(session: BrowserSession): Promise<void> {
    this.session = session;
    const page = session.getPage();
    if (!page) {
      throw new AutomationError('UNKNOWN_UI', 'BrowserSession has no page');
    }
    this.attachPage(page);
    await Promise.resolve();
  }

  async detach(): Promise<void> {
    this.page = null;
    this.session = null;
    this.selectors = null;
    this.activeCorrelationId = null;
    this.cancelled = false;
    await Promise.resolve();
  }

  async healthCheck(): Promise<AutomationProviderHealth> {
    if (!this.page && !this.session) {
      return { ok: false, message: 'GeminiBrowserProvider not attached' };
    }
    try {
      const action = await this.detectUserActionRequired();
      if (action) {
        return { ok: false, message: `User action required: ${action}` };
      }
      const shell = await this.requireSelectors().tryResolve('appShell');
      return {
        ok: shell !== null,
        message: shell ? 'Gemini chat UI available' : 'Gemini chat UI not detected',
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'health check failed',
      };
    }
  }

  /** True when authenticated chat shell is reachable (false on login gate). */
  async detectLogin(): Promise<boolean> {
    const action = await this.detectUserActionRequired();
    if (action === 'LOGIN_REQUIRED') {
      return false;
    }
    if (action) {
      throw this.toAutomationError(action);
    }
    await this.ensureAppShell();
    return true;
  }

  async openProjectNotebook(notebookUrl: string | null): Promise<void> {
    const page = this.requirePage();
    const target = notebookUrl?.startsWith('http') ? notebookUrl : NOTEBOOKLM_URL;
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    this.logEvent('open_project_notebook', { notebookUrl: target });
    await this.assertNoUserActionRequired();
    await this.ensureAppShell();
    const context = await this.requireSelectors().tryResolve('notebookContext');
    if (context) {
      await context.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
    }
  }

  /** Idempotent: reuse active thread or start a new one. Rotates when forceNew. */
  async createOrOpenTranslationThread(options?: { forceNew?: boolean }): Promise<void> {
    await this.ensureAppShell();
    const registry = this.requireSelectors();

    const composerReady = async (): Promise<boolean> => {
      const input = await registry.tryResolve('promptInput', { timeoutMs: 2_500, editable: true });
      return Boolean(input && (await input.isVisible().catch(() => false)));
    };

    if (!options?.forceNew) {
      const active = await registry.tryResolve('activeThread', { timeoutMs: 2_500 });
      if (active && (await active.isVisible().catch(() => false))) {
        if (await composerReady()) {
          this.logEvent('reuse_translation_thread');
          return;
        }
      }
      // Live NotebookLM often has no distinct "active thread" marker — composer alone is enough.
      if (await composerReady()) {
        this.logEvent('reuse_translation_thread', { via: 'promptInput' });
        return;
      }
    }

    const newChat = await registry.tryResolve('newChatButton', { timeoutMs: 4_000 });
    if (newChat) {
      await newChat.click();
      if (await composerReady()) {
        this.logEvent(
          options?.forceNew ? 'rotate_translation_thread' : 'create_translation_thread',
        );
        return;
      }
    }

    // Last resort: wait for composer without clicking New chat (already-open notebook chat).
    const input = await registry.tryResolve('promptInput', { timeoutMs: 8_000, editable: true });
    if (input && (await input.isVisible().catch(() => false))) {
      this.logEvent('reuse_translation_thread', { via: 'promptInput_wait' });
      return;
    }

    throw await this.fail(
      'SELECTOR_NOT_FOUND',
      'Gemini chat composer not found after opening notebook',
      'promptInput',
    );
  }

  async submitTranslationPack(
    pack: TranslationPackDto,
    correlationId: string = newId(),
  ): Promise<string> {
    this.activeCorrelationId = correlationId;
    this.cancelled = false;
    await this.assertNoUserActionRequired();

    const marker = formatCorrelationMarker(correlationId);
    const nudged = appendPlaywrightProtocolNudge(pack.prompt);
    const payload = `${nudged}\n\n${marker}`;

    const page = this.requirePage();
    const registry = this.requireSelectors();
    const input = await registry.resolve('promptInput', { timeoutMs: 8_000, editable: true });
    await this.fillChatComposer(input, payload);
    await this.clickSendOrPressEnter(input);

    this.logEvent('submit_translation_pack', {
      correlationId,
      promptHash: pack.promptHash,
      chapterCount: pack.chapterIds.length,
      payloadChars: payload.length,
      pageUrl: page.url(),
    });

    return correlationId;
  }

  /**
   * Submit a free-form NotebookLM chat prompt (preprocess / analysis).
   * No translation-pack protocol nudge.
   */
  async submitPlainPrompt(
    prompt: string,
    correlationId: string = newId(),
  ): Promise<string> {
    this.activeCorrelationId = correlationId;
    this.cancelled = false;
    await this.assertNoUserActionRequired();

    const marker = formatCorrelationMarker(correlationId);
    const payload = `${prompt.trim()}\n\n${marker}`;

    const page = this.requirePage();
    const registry = this.requireSelectors();
    const input = await registry.resolve('promptInput', { timeoutMs: 8_000, editable: true });
    await this.fillChatComposer(input, payload);
    await this.clickSendOrPressEnter(input);

    this.logEvent('submit_plain_prompt', {
      correlationId,
      payloadChars: payload.length,
      pageUrl: page.url(),
    });

    return correlationId;
  }

  /**
   * NotebookLM/Gemini keep Send disabled until the composer model updates.
   * Angular Material ignores plain fill()/insertText — use native value setter first.
   */
  private async fillChatComposer(input: Locator, payload: string): Promise<void> {
    const page = this.requirePage();
    try {
      await input.click({ timeout: 5_000 });
    } catch {
      await input.click({ timeout: 5_000, force: true });
    }
    await page.keyboard.press('Control+A').catch(async () => {
      await page.keyboard.press('Meta+A');
    });
    await page.keyboard.press('Backspace').catch(() => undefined);

    await setAngularComposerValue(input, payload);
    let actual = await readComposerCharCount(input);

    if (!composerFillLooksValid(payload.length, actual)) {
      try {
        await page.keyboard.insertText(payload);
      } catch {
        await input.fill(payload, { timeout: 15_000 }).catch(() => undefined);
      }
      actual = await readComposerCharCount(input);
    }

    if (!composerFillLooksValid(payload.length, actual)) {
      await setAngularComposerValue(input, payload);
      actual = await readComposerCharCount(input);
    }

    if (!composerFillLooksValid(payload.length, actual)) {
      throw await this.fail(
        'UNKNOWN_UI',
        `NotebookLM composer did not accept prompt (${actual}/${payload.length} chars). Try smaller chapter batch or Web API.`,
        'promptInput',
      );
    }

    // Angular debounce before Send enables.
    await page.waitForTimeout(800);
  }

  private enabledSendLocator(): Locator {
    return this.requirePage()
      .locator(
        [
          'button.actions-enter-button:not([disabled]):not(.mat-mdc-button-disabled)',
          'button[aria-label*="Gửi" i]:not([disabled]):not(.mat-mdc-button-disabled)',
          'button[aria-label*="Send" i]:not([disabled]):not(.mat-mdc-button-disabled)',
          'button[aria-label*="Submit" i]:not([disabled]):not(.mat-mdc-button-disabled)',
          '[data-action="send-prompt"]:not([disabled])',
          '[data-testid="send-prompt"]:not([disabled])',
        ].join(', '),
      )
      .first();
  }

  private async waitForEnabledSend(timeoutMs = 20_000): Promise<Locator | null> {
    const send = this.enabledSendLocator();
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const visible = await send.isVisible().catch(() => false);
      const enabled = visible ? await send.isEnabled().catch(() => false) : false;
      if (visible && enabled) return send;
      await this.requirePage().waitForTimeout(400);
    }
    return null;
  }

  private async clickSendOrPressEnter(input: Locator): Promise<void> {
    const page = this.requirePage();

    const readySend = await this.waitForEnabledSend(20_000);
    if (readySend) {
      await readySend.click({ timeout: 5_000 });
      return;
    }

    const registry = this.requireSelectors();
    const send = await registry.tryResolve('sendButton', { timeoutMs: 2_000 });
    if (send && (await send.isEnabled().catch(() => false))) {
      await send.click({ timeout: 5_000 });
      return;
    }

    await input.press('Enter').catch(() => undefined);
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+Enter').catch(async () => {
      await page.keyboard.press('Meta+Enter');
    });
    await page.waitForTimeout(400);

    const afterEnter = await this.waitForEnabledSend(3_000);
    if (afterEnter) {
      await afterEnter.click({ timeout: 5_000 }).catch(() => undefined);
      return;
    }

    const disabledSend = page
      .locator('button[aria-label*="Gửi" i], button.actions-enter-button')
      .first();
    const disabledVisible = await disabledSend.isVisible().catch(() => false);
    if (disabledVisible) {
      const chars = await readComposerCharCount(input);
      throw await this.fail(
        'UNKNOWN_UI',
        `NotebookLM Send button stayed disabled after filling the chat box (${chars} chars in composer). Retry, or use Gemini Web API.`,
        'sendButton',
      );
    }
  }

  async waitForGenerationStart(timeoutMs = 15_000): Promise<void> {
    const registry = this.requireSelectors();
    const correlationId = this.activeCorrelationId;
    await waitForDomState(
      this.requirePage(),
      async () => {
        if (await registry.isStreamingVisible()) return true;
        if (await registry.isAnyResponseStreaming()) return true;
        if (correlationId && (await registry.responseForCorrelation(correlationId).count()) > 0) {
          return true;
        }
        return false;
      },
      timeoutMs,
      'Generation did not start (no loading indicator)',
    );
    this.logEvent('generation_started', {
      correlationId: this.activeCorrelationId ?? undefined,
    });
  }

  async waitForGenerationComplete(
    correlationId: string,
    options?: { maxTimeoutMs?: number; stabilizationWindowMs?: number },
  ): Promise<void> {
    const registry = this.requireSelectors();
    const maxTimeoutMs = options?.maxTimeoutMs ?? this.maxTimeoutMs;
    const stabilizationWindowMs =
      options?.stabilizationWindowMs ?? this.stabilizationWindowMs;

    await waitForStableResponse({
      maxTimeoutMs,
      stabilizationWindowMs,
      pollIntervalMs: DEFAULT_DOM_POLL_INTERVAL_MS,
      isStreaming: async () => {
        const loading = await registry.isStreamingVisible();
        const responseStreaming = await registry.isAnyResponseStreaming();
        return loading || responseStreaming;
      },
      readText: async () => this.readResponseText(correlationId),
      isCancelled: () => this.cancelled,
    });

    this.logEvent('generation_complete', { correlationId });
  }

  /**
   * Extract latest assistant text for this correlation only.
   * Never returns a previous conversation bubble.
   */
  async extractLatestResponse(correlationId: string): Promise<GeminiRawResponse> {
    const text = await this.readResponseText(correlationId);
    if (!text.trim()) {
      throw await this.fail(
        'SELECTOR_NOT_FOUND',
        `No response found for correlation ${correlationId}`,
        'extractLatestResponse',
      );
    }
    return {
      correlationId,
      text,
      capturedAt: new Date().toISOString(),
    };
  }

  async detectQuotaLimit(): Promise<boolean> {
    const registry = this.requireSelectors();
    const banner = await registry.tryResolve('quotaLimit', { timeoutMs: 400 });
    if (banner) return true;
    const page = this.requirePage();
    const body = await page.locator('body').innerText().catch(() => '');
    return /quota|rate limit|limit reached/i.test(body);
  }

  async detectUserActionRequired(): Promise<UserActionKind | null> {
    const page = this.requirePage();
    const url = page.url();
    const body = await page.locator('body').innerText().catch(() => '');

    if (
      /accounts\.google\.com/i.test(url) ||
      (await page.getByTestId('login-required').count()) > 0 ||
      /sign in/i.test(body)
    ) {
      return 'LOGIN_REQUIRED';
    }
    if (
      (await page.getByTestId('captcha').count()) > 0 ||
      /captcha|unusual traffic|recaptcha/i.test(body)
    ) {
      return 'CAPTCHA';
    }
    if (await this.detectQuotaLimit()) {
      return 'QUOTA_LIMIT';
    }
    return null;
  }

  async cancelGeneration(): Promise<void> {
    this.cancelled = true;
    const registry = this.requireSelectors();
    const stop = await registry.tryResolve('stopButton', { timeoutMs: 800 });
    if (stop && (await stop.isVisible())) {
      await stop.click();
      this.logEvent('generation_cancelled', {
        correlationId: this.activeCorrelationId ?? undefined,
      });
    }
  }

  /** Full send loop: submit → wait start → wait complete → extract raw. */
  async sendPack(pack: TranslationPackDto): Promise<GeminiRawResponse> {
    const correlationId = newId();
    await this.createOrOpenTranslationThread();
    await this.submitTranslationPack(pack, correlationId);
    await this.waitForGenerationStart();
    await this.waitForGenerationComplete(correlationId);
    return this.extractLatestResponse(correlationId);
  }

  /** Persist raw text to disk for recovery (service may delete per project setting). */
  writeRawResponseFile(correlationId: string, text: string, rawDir: string): string {
    fs.mkdirSync(rawDir, { recursive: true });
    const filePath = path.join(rawDir, `${correlationId}.txt`);
    fs.writeFileSync(filePath, text, 'utf8');
    return filePath;
  }

  private async readResponseText(correlationId: string): Promise<string> {
    const registry = this.requireSelectors();
    const scoped = registry.responseForCorrelation(correlationId);
    if ((await scoped.count()) > 0) {
      return sanitizeNotebookAssistantText(await this.readBubbleText(scoped.last()));
    }
    // Live Gemini / Notebook UI rarely stamps data-correlation-id.
    // Fall back to the latest assistant bubble after generation settles.
    const all = registry.assistantResponses();
    const count = await all.count();
    if (count > 0) {
      const text = sanitizeNotebookAssistantText(await this.readBubbleText(all.nth(count - 1)));
      if (text) return text;
    }
    return '';
  }

  /** Prefer .message-text-content (NotebookLM) over full bubble (includes Thoughts UI). */
  private async readBubbleText(bubble: Locator): Promise<string> {
    const inner = bubble.locator('.message-text-content').first();
    if ((await inner.count().catch(() => 0)) > 0) {
      const focused = (await inner.innerText().catch(() => '')).trim();
      if (focused) return focused;
    }
    return (await bubble.innerText().catch(() => '')).trim();
  }

  private async ensureAppShell(): Promise<void> {
    const page = this.requirePage();
    if (!page.url().includes('127.0.0.1') && !/gemini|notebooklm|notebook\.google/i.test(page.url())) {
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }
    // Live NotebookLM/Gemini hydrate slowly — give shell strategies real time after nav.
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await page.waitForTimeout(500).catch(() => undefined);
    await this.assertNoUserActionRequired();
    const shell = await this.requireSelectors().tryResolve('appShell', { timeoutMs: 12_000 });
    if (!shell) {
      throw await this.fail(
        'SELECTOR_NOT_FOUND',
        `Gemini app shell not found (url=${page.url()})`,
        'appShell',
      );
    }
  }

  private async assertNoUserActionRequired(): Promise<void> {
    const action = await this.detectUserActionRequired();
    if (action) {
      throw this.toAutomationError(action);
    }
  }

  private toAutomationError(action: UserActionKind): AutomationError {
    const code: AutomationErrorCode =
      action === 'LOGIN_REQUIRED'
        ? 'LOGIN_REQUIRED'
        : action === 'CAPTCHA'
          ? 'CAPTCHA'
          : 'QUOTA_LIMIT';
    return new AutomationError(code, `User action required: ${action}`);
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new AutomationError('UNKNOWN_UI', 'GeminiBrowserProvider not attached');
    }
    return this.page;
  }

  private requireSelectors(): GeminiSelectorRegistry {
    if (!this.selectors) {
      throw new AutomationError('UNKNOWN_UI', 'GeminiBrowserProvider selectors not ready');
    }
    return this.selectors;
  }

  private logEvent(
    eventType: string,
    payload?: Record<string, unknown>,
  ): void {
    if (!this.eventLogger) return;
    this.eventLogger.log(this.page, {
      eventType,
      correlationId: this.activeCorrelationId ?? undefined,
      jobId: this.jobId,
      workerId: this.workerId,
      payload,
    });
  }

  private async fail(
    code: AutomationErrorCode,
    message: string,
    operation: string,
  ): Promise<AutomationError> {
    const diagnostics = await captureFailureDiagnostics({
      page: this.page,
      diagnosticsDir: this.diagnosticsDir,
      operationName: operation,
      tag: operation,
    });
    return new AutomationError(code, message, diagnostics);
  }
}
