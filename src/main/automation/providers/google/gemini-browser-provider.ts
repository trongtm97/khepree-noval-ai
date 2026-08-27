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
  AutomationTimeline,
  timelineStepForOperation,
  type AutomationTimelineStep,
} from '../../automation-timeline';
import type { FailTraceSession } from '../../playwright-tracing';
import { stopFailTrace } from '../../playwright-tracing';
import {
  DEFAULT_DOM_POLL_INTERVAL_MS,
  DEFAULT_GENERATION_MAX_TIMEOUT_MS,
  DEFAULT_SEND_CONFIRM_TIMEOUT_MS,
  DEFAULT_STABILIZATION_WINDOW_MS,
  formatCorrelationMarker,
  GEMINI_URL,
  NO_INDICATOR_STABILIZATION_WINDOW_MS,
  NOTEBOOKLM_URL,
  type GeminiRequestLifecycle,
} from '@shared/constants/gemini';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import {
  appendPlaywrightProtocolNudge,
  sanitizeNotebookAssistantText,
} from '@shared/utils/notebook-response-sanitize';
import {
  hashComposerText,
  readComposerCharCount,
  readComposerText,
  setAngularComposerValue,
  verifyComposerPayload,
} from '@shared/utils/notebook-composer-fill';
import { GeminiSelectorRegistry } from './selectors/google-gemini.selectors';
import { waitForDomState } from './response-stabilizer';
import {
  pageHasGeneratingIndicator,
  runTargetGenerationLifecycle,
  targetLooksBusy,
  type GenerationPhase,
} from './generation-lifecycle';
import {
  captureConversationSnapshot,
  detectSendConfirmation,
  looksUnsent,
  stopGeneratingLocators,
  type ConversationSnapshot,
  type SendConfirmEvidence,
} from './conversation-snapshot';
import {
  collectAssistantFingerprints,
  createResponseAnchor,
  detectGenerationStart,
  findUserMessageWithMarker,
  resolveAssistantForAnchor,
  type ResponseAnchor,
} from './response-anchor';
import { newId } from '../../../db/utils/uuid';

export type UserActionKind = 'LOGIN_REQUIRED' | 'CAPTCHA' | 'QUOTA_LIMIT';

/** Keyboard send only when the live surface has confirmed the shortcut. Default: none. */
export type ConfirmedSendShortcut = 'Enter' | 'Control+Enter' | 'Meta+Enter';

export interface GeminiBrowserProviderOptions {
  diagnosticsDir: string;
  baseUrl?: string;
  eventLogger?: BrowserEventLogger;
  workerId?: string | null;
  jobId?: string | null;
  maxTimeoutMs?: number;
  stabilizationWindowMs?: number;
  /** Max wait after Send for confirmation evidence. Default 10s. */
  sendConfirmTimeoutMs?: number;
  /** Max wait for an enabled Send button. Default 20s. */
  sendButtonWaitMs?: number;
  /**
   * Optional keyboard send shortcut — OFF unless surface config confirms it.
   * Never used as a silent default fallback.
   */
  confirmedSendShortcut?: ConfirmedSendShortcut | null;
  /**
   * Quiet window when no generating indicator is observable (default 6s).
   * Longer than stabilizationWindowMs so early spinner disappearance does not fake COMPLETE.
   */
  noIndicatorStabilizationWindowMs?: number;
  /** Persist gemini_requests lifecycle transitions (idempotent resume). */
  onLifecycle?: (lifecycle: GeminiRequestLifecycle, meta?: Record<string, unknown>) => void;
  /** Expected Translation Notebook URL (for NOTEBOOK_VERIFIED / mismatch). */
  expectedNotebookUrl?: string | null;
  /** Active fail-trace session (retry/diagnostics only). */
  failTraceSession?: FailTraceSession | null;
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
  private readonly sendConfirmTimeoutMs: number;
  private readonly sendButtonWaitMs: number;
  private readonly confirmedSendShortcut: ConfirmedSendShortcut | null;
  private readonly noIndicatorStabilizationWindowMs: number;
  private readonly onLifecycle:
    | ((lifecycle: GeminiRequestLifecycle, meta?: Record<string, unknown>) => void)
    | null;
  private activeCorrelationId: string | null = null;
  private activeAnchor: ResponseAnchor | null = null;
  private generationPhase: GenerationPhase | null = null;
  private cancelled = false;
  /** Prevents double-click while a send handshake is in flight. */
  private sendInFlight = false;
  private timeline: AutomationTimeline | null = null;
  private expectedNotebookUrl: string | null;
  private failTraceSession: FailTraceSession | null;
  private consoleErrors: string[] = [];
  private pageErrors: string[] = [];
  private lastSelectorStrategyWinner: string | null = null;
  private lastComposerLength: number | null = null;
  private lastComposerHash: string | null = null;
  private lastConversationBefore: number | null = null;
  private lastConversationAfter: number | null = null;
  private lastSendEvidence: unknown = null;
  private lastResponseEvidence: unknown = null;
  private lastSurface: string | null = null;
  private pageErrorHandlersAttached = false;

  constructor(options: GeminiBrowserProviderOptions) {
    this.diagnosticsDir = options.diagnosticsDir;
    this.baseUrl = options.baseUrl ?? GEMINI_URL;
    this.eventLogger = options.eventLogger ?? null;
    this.workerId = options.workerId ?? null;
    this.jobId = options.jobId ?? null;
    this.maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_GENERATION_MAX_TIMEOUT_MS;
    this.stabilizationWindowMs =
      options.stabilizationWindowMs ?? DEFAULT_STABILIZATION_WINDOW_MS;
    this.sendConfirmTimeoutMs =
      options.sendConfirmTimeoutMs ?? DEFAULT_SEND_CONFIRM_TIMEOUT_MS;
    this.sendButtonWaitMs = options.sendButtonWaitMs ?? 20_000;
    this.confirmedSendShortcut = options.confirmedSendShortcut ?? null;
    this.noIndicatorStabilizationWindowMs =
      options.noIndicatorStabilizationWindowMs ?? NO_INDICATOR_STABILIZATION_WINDOW_MS;
    this.onLifecycle = options.onLifecycle ?? null;
    this.expectedNotebookUrl = options.expectedNotebookUrl ?? null;
    this.failTraceSession = options.failTraceSession ?? null;
  }

  /** Begin a fresh AutomationTimeline for one browser AI request. */
  beginTimeline(correlationId?: string): AutomationTimeline {
    this.timeline = new AutomationTimeline(correlationId ?? null);
    this.consoleErrors = [];
    this.pageErrors = [];
    this.lastSendEvidence = null;
    this.lastResponseEvidence = null;
    this.lastConversationBefore = null;
    this.lastConversationAfter = null;
    return this.timeline;
  }

  getTimeline(): AutomationTimeline | null {
    return this.timeline;
  }

  setExpectedNotebookUrl(url: string | null): void {
    this.expectedNotebookUrl = url;
  }

  setFailTraceSession(session: FailTraceSession | null): void {
    this.failTraceSession = session;
  }

  /** Discard open fail-trace without writing a zip (success path). */
  async discardFailTrace(): Promise<void> {
    const context = this.page?.context() ?? null;
    if (this.failTraceSession?.enabled && context) {
      await stopFailTrace(context, this.failTraceSession, false);
    }
    this.failTraceSession = null;
  }

  private emitLifecycle(
    lifecycle: GeminiRequestLifecycle,
    meta?: Record<string, unknown>,
  ): void {
    try {
      this.onLifecycle?.(lifecycle, meta);
    } catch {
      // persistence must not break automation
    }
  }

  attachPage(page: Page): void {
    this.page = page;
    this.attachPageErrorListeners(page);
    this.selectors = new GeminiSelectorRegistry(page, this.diagnosticsDir, (win) => {
      this.lastSelectorStrategyWinner = win.strategyId;
      this.logEvent('SELECTOR_STRATEGY_WIN', {
        surface: win.surface,
        operation: win.operation,
        strategyId: win.strategyId,
        durationMs: win.durationMs,
        fallbackDepth: win.fallbackDepth,
        score: win.score,
      });
    });
  }

  private attachPageErrorListeners(page: Page): void {
    if (this.pageErrorHandlersAttached) return;
    this.pageErrorHandlersAttached = true;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(msg.text().slice(0, 500));
        if (this.consoleErrors.length > 40) this.consoleErrors.shift();
      }
    });
    page.on('pageerror', (err) => {
      this.pageErrors.push(err.message.slice(0, 500));
      if (this.pageErrors.length > 40) this.pageErrors.shift();
    });
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
    this.activeAnchor = null;
    this.generationPhase = null;
    this.cancelled = false;
    this.sendInFlight = false;
    this.pageErrorHandlersAttached = false;
    this.timeline = null;
    await Promise.resolve();
  }

  /**
   * Recovery probe: locate correlation marker + assistant state without sending.
   */
  async probeForRecovery(marker: string): Promise<{
    markerFound: boolean;
    generationActive: boolean;
    responseComplete: boolean;
  }> {
    const page = this.requirePage();
    const registry = this.requireSelectors();
    const user = await findUserMessageWithMarker(page, marker);
    if (!user) {
      return { markerFound: false, generationActive: false, responseComplete: false };
    }

    const assistants = registry.assistantResponses();
    const fingerprints = await collectAssistantFingerprints(assistants);
    const correlationId = this.activeCorrelationId ?? 'recovery';
    const anchor = createResponseAnchor({
      correlationId,
      marker,
      assistantCount: fingerprints.length,
      lastAssistantHash: fingerprints[fingerprints.length - 1] ?? null,
      assistantFingerprints: fingerprints,
    });
    anchor.userMessageFingerprint = user.fingerprint;

    const resolved = await resolveAssistantForAnchor({
      page,
      assistants,
      anchor,
      userLocator: user.locator,
    });

    const streaming = await registry.isStreamingVisible().catch(() => false);
    const generating = await pageHasGeneratingIndicator(page).catch(() => false);
    let generationActive = streaming || Boolean(generating);
    let responseComplete = false;

    if (resolved.ok) {
      const text = sanitizeNotebookAssistantText(
        (await resolved.locator.innerText().catch(() => '')).trim(),
      );
      const busy = await targetLooksBusy(resolved.locator).catch(() => false);
      generationActive = generationActive || Boolean(busy);
      responseComplete = text.length > 0 && !generationActive;
    }

    return { markerFound: true, generationActive, responseComplete };
  }

  /**
   * Rebuild ResponseAnchor after crash so wait/extract can run without resend.
   */
  async resumeAnchorFromMarker(correlationId: string, marker: string): Promise<boolean> {
    this.activeCorrelationId = correlationId;
    const page = this.requirePage();
    const registry = this.requireSelectors();
    const user = await findUserMessageWithMarker(page, marker);
    if (!user) {
      this.activeAnchor = null;
      return false;
    }
    const fingerprints = await collectAssistantFingerprints(registry.assistantResponses());
    this.activeAnchor = createResponseAnchor({
      correlationId,
      marker,
      assistantCount: fingerprints.length,
      lastAssistantHash: fingerprints[fingerprints.length - 1] ?? null,
      assistantFingerprints: fingerprints,
    });
    this.activeAnchor.userMessageFingerprint = user.fingerprint;
    await this.bindUserMessageToAnchor(marker);
    this.generationPhase = 'SEND_CONFIRMED';
    this.emitLifecycle('SENT_CONFIRMED', { via: 'resumeAnchorFromMarker' });
    return true;
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
    this.expectedNotebookUrl = target;
    if (!this.timeline) this.beginTimeline();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    this.logEvent('open_project_notebook', { notebookUrl: target });
    await this.assertNoUserActionRequired();
    await this.ensureAppShell();
    const actual = page.url();
    const context = await this.requireSelectors().tryResolve('notebookContext');
    if (context) {
      await context.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
    }
    if (notebookUrl?.startsWith('http')) {
      try {
        const expectedHost = new URL(target).hostname;
        const actualHost = new URL(actual).hostname;
        const expectedId = new URL(target).pathname.split('/').filter(Boolean).pop();
        const hostOk =
          actualHost === expectedHost ||
          /notebooklm|notebook\.google|gemini\.google/i.test(actualHost);
        const idOk = !expectedId || actual.includes(expectedId);
        if (!hostOk || (!idOk && expectedId && expectedId.length > 8)) {
          throw await this.fail(
            'NOTEBOOK_MISMATCH',
            `Expected notebook ${target} but landed on ${actual}`,
            'notebookVerify',
          );
        }
      } catch (error) {
        if (error instanceof AutomationError) throw error;
      }
    }
    this.markTimeline('NOTEBOOK_VERIFIED', {
      expected: target,
      actual,
      hasNotebookContext: Boolean(context),
    });
    this.logEvent('NOTEBOOK_VERIFIED', { expected: target, actual });
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
    if (!this.timeline) this.beginTimeline(correlationId);
    else this.timeline.setCorrelationId(correlationId);
    await this.assertNoUserActionRequired();

    const marker = formatCorrelationMarker(correlationId);
    const nudged = appendPlaywrightProtocolNudge(pack.prompt);
    const payload = `${nudged}\n\n${marker}`;

    const page = this.requirePage();
    await this.submitPayloadWithSendHandshake(payload, marker);

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
   * No translation-pack protocol nudge. Same send handshake as translation.
   */
  async submitPlainPrompt(
    prompt: string,
    correlationId: string = newId(),
  ): Promise<string> {
    this.activeCorrelationId = correlationId;
    this.cancelled = false;
    if (!this.timeline) this.beginTimeline(correlationId);
    else this.timeline.setCorrelationId(correlationId);
    await this.assertNoUserActionRequired();

    const marker = formatCorrelationMarker(correlationId);
    const payload = `${prompt.trim()}\n\n${marker}`;

    const page = this.requirePage();
    await this.submitPayloadWithSendHandshake(payload, marker);

    this.logEvent('submit_plain_prompt', {
      correlationId,
      payloadChars: payload.length,
      pageUrl: page.url(),
    });

    return correlationId;
  }

  /**
   * ComposerReady → FillVerified → Snapshot → ClickSend → SendConfirmed.
   * Never proceeds to generation wait without confirmation evidence.
   */
  private async submitPayloadWithSendHandshake(
    payload: string,
    correlationMarker: string,
  ): Promise<void> {
    if (this.sendInFlight) {
      throw await this.fail(
        'SEND_NOT_CONFIRMED',
        'Send already in flight — refusing double-submit',
        'sendHandshake',
      );
    }
    this.sendInFlight = true;
    this.activeAnchor = null;
    this.generationPhase = null;
    try {
      const input = await this.ensureComposerReady();
      await this.fillChatComposerVerified(input, payload);
      const before = await this.snapshotConversation(input, correlationMarker);
      await this.clickSendAndConfirm(input, before, correlationMarker);
      this.generationPhase = 'SEND_CONFIRMED';
    } finally {
      this.sendInFlight = false;
    }
  }

  private async ensureComposerReady(): Promise<Locator> {
    const registry = this.requireSelectors();
    const surface = await registry.ensureSurface();
    this.lastSurface = surface;
    this.markTimeline('SURFACE_DETECTED', {
      surface,
      via: registry.getDetection()?.via ?? null,
    });
    this.logEvent('SURFACE_DETECTED', {
      surface,
      via: registry.getDetection()?.via ?? null,
      evidence: registry.getDetection()?.evidence ?? [],
    });
    const input = await registry.resolve('promptInput', { timeoutMs: 8_000, editable: true });
    const visible = await input.isVisible().catch(() => false);
    const enabled = await input.isEnabled().catch(() => false);
    if (!visible || !enabled) {
      throw await this.fail(
        'SELECTOR_NOT_FOUND',
        'Chat composer not visible/enabled in chat panel',
        'promptInput',
      );
    }
    this.markTimeline('COMPOSER_FOUND', { surface, visible, enabled });
    this.logEvent('COMPOSER_FOUND', {
      correlationId: this.activeCorrelationId ?? undefined,
      surface,
    });
    this.logEvent('COMPOSER_READY', {
      correlationId: this.activeCorrelationId ?? undefined,
      surface,
    });
    return input;
  }

  /**
   * NotebookLM/Gemini keep Send disabled until the composer model updates.
   * Angular Material ignores plain fill()/insertText — use native value setter first.
   * Verifies length + prefix + suffix + hash (not char-count alone).
   */
  private async fillChatComposerVerified(input: Locator, payload: string): Promise<void> {
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
    let actual = await readComposerText(input);
    let verdict = verifyComposerPayload(payload, actual);

    if (verdict !== 'ok') {
      try {
        await page.keyboard.insertText(payload);
      } catch {
        await input.fill(payload, { timeout: 15_000 }).catch(() => undefined);
      }
      actual = await readComposerText(input);
      verdict = verifyComposerPayload(payload, actual);
    }

    if (verdict !== 'ok') {
      await setAngularComposerValue(input, payload);
      actual = await readComposerText(input);
      verdict = verifyComposerPayload(payload, actual);
    }

    if (verdict === 'truncated') {
      throw await this.fail(
        'PROMPT_TOO_LARGE',
        `Composer truncated prompt (${actual.length}/${payload.length} chars). Use smaller chapter batch or Web API.`,
        'promptInput',
      );
    }
    if (verdict !== 'ok') {
      throw await this.fail(
        'COMPOSER_FILL_FAILED',
        `NotebookLM composer did not accept prompt (${actual.length}/${payload.length} chars, hash=${hashComposerText(actual)}).`,
        'promptInput',
      );
    }

    // Angular debounce before Send enables.
    await page.waitForTimeout(800);
    this.lastComposerLength = actual.length;
    this.lastComposerHash = hashComposerText(actual);
    this.markTimeline('PROMPT_FILLED', {
      payloadChars: payload.length,
      actualChars: actual.length,
      composerHash: this.lastComposerHash,
    });
    this.logEvent('PROMPT_FILLED', {
      correlationId: this.activeCorrelationId ?? undefined,
      payloadChars: payload.length,
      actualChars: actual.length,
      composerHash: this.lastComposerHash,
    });
    this.emitLifecycle('COMPOSER_FILLED', {
      payloadChars: payload.length,
    });
  }

  private async snapshotConversation(
    input: Locator,
    correlationMarker: string,
  ): Promise<ConversationSnapshot> {
    const registry = this.requireSelectors();
    const composerText = await readComposerText(input);
    const snap = await captureConversationSnapshot({
      page: this.requirePage(),
      composer: input,
      assistantResponses: registry.assistantResponses(),
      correlationMarker,
      composerText,
    });
    this.lastConversationBefore = snap.assistantMessageCount;
    return snap;
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

  private async clickActualSendButton(input: Locator): Promise<void> {
    const readySend = await this.waitForEnabledSend(this.sendButtonWaitMs);
    if (readySend) {
      await readySend.click({ timeout: 5_000 });
      return;
    }

    const registry = this.requireSelectors();
    const send = await registry.tryResolve('sendButton', { timeoutMs: 600 });
    if (send && (await send.isEnabled().catch(() => false))) {
      await send.click({ timeout: 5_000 });
      return;
    }

    if (this.confirmedSendShortcut) {
      await this.pressConfirmedSendShortcut(input);
      return;
    }

    const page = this.requirePage();
    const disabledSend = page
      .locator('button[aria-label*="Gửi" i], button.actions-enter-button, [data-testid="send-prompt"]')
      .first();
    const disabledVisible = await disabledSend.isVisible().catch(() => false);
    if (disabledVisible) {
      const chars = await readComposerCharCount(input);
      throw await this.fail(
        'SEND_DISABLED',
        `NotebookLM Send button stayed disabled after filling the chat box (${chars} chars in composer). Retry, or use Gemini Web API.`,
        'sendButton',
      );
    }

    throw await this.fail(
      'SELECTOR_NOT_FOUND',
      'Send button not found/enabled — keyboard fallback disabled (no confirmedSendShortcut)',
      'sendButton',
    );
  }

  private async pressConfirmedSendShortcut(input: Locator): Promise<void> {
    const page = this.requirePage();
    const shortcut = this.confirmedSendShortcut;
    if (!shortcut) return;
    if (shortcut === 'Enter') {
      await input.press('Enter');
      return;
    }
    await page.keyboard.press(shortcut);
  }

  private async clickSendAndConfirm(
    input: Locator,
    before: ConversationSnapshot,
    correlationMarker: string,
  ): Promise<void> {
    const registry = this.requireSelectors();
    const fingerprints = await collectAssistantFingerprints(registry.assistantResponses());
    const correlationId = this.activeCorrelationId ?? 'unknown';
    this.activeAnchor = createResponseAnchor({
      correlationId,
      marker: correlationMarker,
      assistantCount: before.assistantMessageCount,
      lastAssistantHash: before.lastAssistantHash,
      assistantFingerprints: fingerprints,
    });

    await this.clickActualSendButton(input);
    this.markTimeline('SEND_CLICKED', { attempt: 1 });
    this.logEvent('SEND_CLICKED', {
      correlationId: this.activeCorrelationId ?? undefined,
      attempt: 1,
    });
    this.emitLifecycle('SEND_CLICKED');

    let evidence = await this.waitForSendEvidence(input, before, correlationMarker);
    if (evidence) {
      await this.bindUserMessageToAnchor(correlationMarker);
      this.lastSendEvidence = evidence;
      this.lastConversationBefore = before.assistantMessageCount;
      this.lastConversationAfter = before.assistantMessageCount + 1;
      this.markTimeline('SEND_CONFIRMED', { evidence, attempt: 1 });
      this.logEvent('SEND_CONFIRMED', {
        correlationId: this.activeCorrelationId ?? undefined,
        evidence,
        attempt: 1,
      });
      this.emitLifecycle('SENT_CONFIRMED', { evidence, attempt: 1 });
      return;
    }

    const stillUnsent = looksUnsent(before, await readComposerText(input), null);
    if (stillUnsent) {
      try {
        await input.click({ timeout: 3_000 });
      } catch {
        await input.click({ timeout: 3_000, force: true }).catch(() => undefined);
      }
      await this.clickActualSendButton(input);
      this.markTimeline('SEND_CLICKED', { attempt: 2, retry: true });
      this.logEvent('SEND_CLICKED', {
        correlationId: this.activeCorrelationId ?? undefined,
        attempt: 2,
        retry: true,
      });
      this.emitLifecycle('SEND_CLICKED', { attempt: 2, retry: true });
      evidence = await this.waitForSendEvidence(input, before, correlationMarker);
      if (evidence) {
        await this.bindUserMessageToAnchor(correlationMarker);
        this.lastSendEvidence = evidence;
        this.markTimeline('SEND_CONFIRMED', { evidence, attempt: 2 });
        this.logEvent('SEND_CONFIRMED', {
          correlationId: this.activeCorrelationId ?? undefined,
          evidence,
          attempt: 2,
        });
        this.emitLifecycle('SENT_CONFIRMED', { evidence, attempt: 2 });
        return;
      }
    }

    this.activeAnchor = null;
    this.logEvent('SEND_NOT_CONFIRMED', {
      correlationId: this.activeCorrelationId ?? undefined,
      composerStillFilled: stillUnsent,
    });
    throw await this.fail(
      'SEND_NOT_CONFIRMED',
      `Send not confirmed within ${this.sendConfirmTimeoutMs}ms — refusing to wait for AI generation`,
      'sendConfirm',
    );
  }

  private async bindUserMessageToAnchor(correlationMarker: string): Promise<void> {
    if (!this.activeAnchor) return;
    const user = await findUserMessageWithMarker(this.requirePage(), correlationMarker);
    if (user) {
      this.activeAnchor.userMessageFingerprint = user.fingerprint;
    }
  }

  private async waitForSendEvidence(
    input: Locator,
    before: ConversationSnapshot,
    correlationMarker: string,
  ): Promise<SendConfirmEvidence | null> {
    const registry = this.requireSelectors();
    const started = Date.now();
    while (Date.now() - started < this.sendConfirmTimeoutMs) {
      const evidence = await detectSendConfirmation({
        page: this.requirePage(),
        composer: input,
        assistantResponses: registry.assistantResponses(),
        before,
        correlationMarker,
        readComposerText: () => readComposerText(input),
      });
      if (evidence) return evidence;
      await this.requirePage().waitForTimeout(200);
    }
    return null;
  }

  async waitForGenerationStart(timeoutMs = 15_000): Promise<void> {
    const registry = this.requireSelectors();
    const anchor = this.activeAnchor;
    if (!anchor) {
      throw await this.fail(
        'RESPONSE_NOT_FOUND',
        'No ResponseAnchor — send was not confirmed for this request',
        'waitForGenerationStart',
      );
    }

    let startEvidence: string | null = null;
    await waitForDomState(
      this.requirePage(),
      async () => {
        await this.bindUserMessageToAnchor(anchor.marker);
        const early = await this.tryResolveTarget(anchor.correlationId);
        const targetLocator = early.ok ? early.locator : null;
        const evidence = await detectGenerationStart({
          page: this.requirePage(),
          assistants: registry.assistantResponses(),
          anchor,
          targetLocator,
          readTargetText: early.ok
            ? async () => sanitizeNotebookAssistantText(await this.readBubbleText(early.locator))
            : undefined,
          isStreamingVisible: () => registry.isStreamingVisible(),
          isStopVisible: async () => {
            const stop = stopGeneratingLocators(this.requirePage()).first();
            return stop.isVisible().catch(() => false);
          },
        });
        if (evidence) {
          startEvidence = evidence;
          return true;
        }
        return false;
      },
      timeoutMs,
      'Generation did not start (no anchored turn evidence)',
    );
    this.generationPhase = 'GENERATION_STARTED';
    this.markTimeline('GENERATION_STARTED', {
      evidence: startEvidence,
      marker: anchor.marker,
    });
    this.logEvent('GENERATION_STARTED', {
      correlationId: this.activeCorrelationId ?? undefined,
      phase: this.generationPhase,
      evidence: startEvidence,
      marker: anchor.marker,
      userFingerprint: this.activeAnchor?.userMessageFingerprint ?? null,
    });
    this.emitLifecycle('GENERATION_STARTED', { evidence: startEvidence });
  }

  async waitForGenerationComplete(
    correlationId: string,
    options?: { maxTimeoutMs?: number; stabilizationWindowMs?: number },
  ): Promise<void> {
    const maxTimeoutMs = options?.maxTimeoutMs ?? this.maxTimeoutMs;
    const stabilizationWindowMs =
      options?.stabilizationWindowMs ?? this.stabilizationWindowMs;

    // Identify target assistant for THIS request, then observe only that node.
    await this.ensureTargetResponseResolved(
      correlationId,
      Math.min(30_000, maxTimeoutMs),
    );
    this.generationPhase = 'RESPONSE_CREATED';
    this.markTimeline('RESPONSE_CREATED', {
      resolvedVia: this.activeAnchor?.resolvedVia ?? null,
    });
    this.logEvent('RESPONSE_CREATED', {
      correlationId,
      phase: this.generationPhase,
      resolvedVia: this.activeAnchor?.resolvedVia ?? null,
    });
    this.emitLifecycle('RESPONSE_SEEN', {
      resolvedVia: this.activeAnchor?.resolvedVia ?? null,
    });

    try {
      const result = await runTargetGenerationLifecycle({
        maxTimeoutMs,
        stabilizationWindowMs,
        noIndicatorStabilizationWindowMs: this.noIndicatorStabilizationWindowMs,
        pollIntervalMs: DEFAULT_DOM_POLL_INTERVAL_MS,
        initialPhase: 'RESPONSE_CREATED',
        resolveTarget: async () => {
          const resolved = await this.tryResolveTarget(correlationId);
          return resolved.ok ? resolved.locator : null;
        },
        readTargetText: async () => this.readAnchoredResponseText(correlationId),
        readGeneratingIndicator: async () => {
          const resolved = await this.tryResolveTarget(correlationId);
          if (!resolved.ok) return null;
          const busy = await targetLooksBusy(resolved.locator);
          if (busy === true) return true;
          const pageHit = await pageHasGeneratingIndicator(this.requirePage());
          if (pageHit === true) return true;
          if (busy === false && pageHit === false) return false;
          // No reliable indicator → null forces longer quiet window.
          return null;
        },
        isCancelled: () => this.cancelled,
        onPhase: (phase, detail) => {
          this.generationPhase = phase;
          this.logEvent(phase, {
            correlationId,
            phase,
            ...detail,
          });
        },
      });

      this.generationPhase = result.incomplete ? 'RESPONSE_STABILIZING' : 'RESPONSE_COMPLETE';
      this.lastResponseEvidence = {
        length: result.text.length,
        incomplete: result.incomplete ?? false,
        usedNoIndicatorWindow: result.usedNoIndicatorWindow,
        targetFingerprint: this.activeAnchor?.targetResponseFingerprint ?? null,
      };
      if (!result.incomplete) {
        this.markTimeline('RESPONSE_STABLE', this.lastResponseEvidence as Record<string, unknown>);
      }
      this.logEvent(result.incomplete ? 'OUTPUT_INCOMPLETE' : 'RESPONSE_STABLE', {
        correlationId,
        phase: this.generationPhase,
        targetFingerprint: this.activeAnchor?.targetResponseFingerprint ?? null,
        resolvedVia: this.activeAnchor?.resolvedVia ?? null,
        usedNoIndicatorWindow: result.usedNoIndicatorWindow,
        length: result.text.length,
        incomplete: result.incomplete ?? false,
      });
      this.logEvent(result.incomplete ? 'OUTPUT_INCOMPLETE' : 'RESPONSE_COMPLETE', {
        correlationId,
        phase: this.generationPhase,
        length: result.text.length,
        incomplete: result.incomplete ?? false,
      });
    } catch (error) {
      if (error instanceof AutomationError) {
        throw await this.fail(error.code, error.message, 'waitForGenerationComplete');
      }
      throw error;
    }
  }

  /**
   * Extract assistant text proven to belong to this correlation via ResponseAnchor.
   * Throws RESPONSE_NOT_FOUND / RESPONSE_AMBIGUOUS when unproven — never returns an old bubble.
   */
  async extractLatestResponse(correlationId: string): Promise<GeminiRawResponse> {
    const text = await this.readAnchoredResponseText(correlationId);
    if (!text.trim()) {
      throw await this.fail(
        'RESPONSE_NOT_FOUND',
        `No anchored response for correlation ${correlationId}`,
        'extractLatestResponse',
      );
    }
    this.markTimeline('CAPTURED', { chars: text.length });
    this.timeline?.complete();
    this.logEvent('CAPTURED', {
      correlationId,
      chars: text.length,
    });
    return {
      correlationId,
      text,
      capturedAt: new Date().toISOString(),
    };
  }

  private async ensureTargetResponseResolved(
    correlationId: string,
    timeoutMs: number,
  ): Promise<Locator> {
    const started = Date.now();
    let lastReason = 'not resolved';
    while (Date.now() - started < timeoutMs) {
      const resolved = await this.tryResolveTarget(correlationId);
      if (resolved.ok) return resolved.locator;
      lastReason = resolved.reason;
      if (resolved.ambiguous) {
        throw await this.fail(
          'RESPONSE_AMBIGUOUS',
          resolved.reason,
          'ensureTargetResponseResolved',
        );
      }
      await this.requirePage().waitForTimeout(200);
    }
    throw await this.fail(
      'RESPONSE_NOT_FOUND',
      `Target assistant not identified within ${timeoutMs}ms (${lastReason})`,
      'ensureTargetResponseResolved',
    );
  }

  private async tryResolveTarget(
    correlationId: string,
  ): Promise<
    | { ok: true; locator: Locator }
    | { ok: false; ambiguous: boolean; reason: string }
  > {
    const anchor = this.activeAnchor;
    if (anchor?.correlationId !== correlationId) {
      return {
        ok: false,
        ambiguous: false,
        reason: 'ResponseAnchor missing or correlation mismatch',
      };
    }

    const page = this.requirePage();
    const registry = this.requireSelectors();
    await this.bindUserMessageToAnchor(anchor.marker);
    const user = await findUserMessageWithMarker(page, anchor.marker);

    const result = await resolveAssistantForAnchor({
      page,
      assistants: registry.assistantResponses(),
      anchor,
      userLocator: user?.locator ?? null,
    });

    if (!result.ok) {
      return { ok: false, ambiguous: result.ambiguous, reason: result.reason };
    }

    anchor.targetResponseFingerprint = result.fingerprint;
    anchor.resolvedVia = result.via;
    if (user) {
      anchor.userMessageFingerprint = user.fingerprint;
    }
    return { ok: true, locator: result.locator };
  }

  private async readAnchoredResponseText(correlationId: string): Promise<string> {
    const resolved = await this.tryResolveTarget(correlationId);
    if (!resolved.ok) {
      if (resolved.ambiguous) {
        throw await this.fail(
          'RESPONSE_AMBIGUOUS',
          resolved.reason,
          'readAnchoredResponseText',
        );
      }
      return '';
    }
    return sanitizeNotebookAssistantText(await this.readBubbleText(resolved.locator));
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

  /**
   * Diagnostics probe: surface + composer only (no send).
   */
  async probeComposerReady(): Promise<{ ok: boolean; surface: string | null }> {
    try {
      const input = await this.ensureComposerReady();
      const visible = await input.isVisible().catch(() => false);
      return { ok: visible, surface: this.lastSurface };
    } catch {
      return { ok: false, surface: this.lastSurface };
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
    const registry = this.requireSelectors();
    registry.invalidateSurfaceCache();
    const surface = await registry.ensureSurface();
    this.lastSurface = surface;
    this.markTimeline('SURFACE_DETECTED', {
      surface,
      via: registry.getDetection()?.via ?? null,
    });
    this.logEvent('SURFACE_DETECTED', {
      surface,
      via: registry.getDetection()?.via ?? null,
      evidence: registry.getDetection()?.evidence ?? [],
    });
    if (surface === 'GOOGLE_LOGIN') {
      throw await this.fail('LOGIN_REQUIRED', 'Google login surface detected', 'surface');
    }
    const shell = await registry.tryResolve('appShell', { timeoutMs: 12_000 });
    if (!shell) {
      throw await this.fail(
        'SELECTOR_NOT_FOUND',
        `Chat app shell not found on ${surface} (url=${page.url()})`,
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
      throw new AutomationError(
        'UNKNOWN_UI',
        'GeminiBrowserProvider not attached (no page) — timeline never started',
      );
    }
    return this.page;
  }

  private requireSelectors(): GeminiSelectorRegistry {
    if (!this.selectors) {
      throw new AutomationError(
        'UNKNOWN_UI',
        'GeminiBrowserProvider selectors not ready — attach page first',
      );
    }
    return this.selectors;
  }

  private markTimeline(
    step: AutomationTimelineStep,
    detail?: Record<string, unknown>,
  ): void {
    const timeline = this.timeline ?? this.beginTimeline(this.activeCorrelationId ?? undefined);
    this.timeline = timeline;
    timeline.mark(step, detail);
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
    const step = timelineStepForOperation(operation);
    const timeline = this.timeline ?? this.beginTimeline(this.activeCorrelationId ?? undefined);
    this.timeline = timeline;
    timeline.fail(step, message, { code, operation });
    const snap = timeline.snapshot();
    const annotated = `${message} | ${timeline.describeFailure()}`;

    let tracePath: string | null = null;
    const context = this.page?.context() ?? null;
    if (this.failTraceSession?.enabled && context) {
      tracePath = await stopFailTrace(context, this.failTraceSession, true);
      this.failTraceSession = null;
    }

    const diagnostics = await captureFailureDiagnostics({
      page: this.page,
      diagnosticsDir: this.diagnosticsDir,
      operationName: operation,
      tag: operation,
      errorCode: code,
      surface: this.lastSurface,
      expectedNotebookUrl: this.expectedNotebookUrl,
      actualNotebookUrl: this.page?.url() ?? null,
      selectorStrategyWinner: this.lastSelectorStrategyWinner,
      composerTextLength: this.lastComposerLength,
      composerTextHash: this.lastComposerHash,
      conversationCountBefore: this.lastConversationBefore,
      conversationCountAfter: this.lastConversationAfter,
      sendEvidence: this.lastSendEvidence,
      responseEvidence: this.lastResponseEvidence,
      consoleErrors: this.consoleErrors,
      pageErrors: this.pageErrors,
      timeline: snap,
      failedStep: snap.failedStep,
      lastOkStep: snap.lastOkStep,
      tracePath,
    });

    this.logEvent('AUTOMATION_FAIL', {
      code,
      operation,
      failedStep: snap.failedStep,
      lastOkStep: snap.lastOkStep,
      message: annotated,
    });

    return new AutomationError(code, annotated, diagnostics);
  }
}
