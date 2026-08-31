import type { Page } from 'playwright';
import { AutomationError } from '../errors/automation-errors';
import {
  type BrowserConversationState,
  type HarnessPhaseTimeouts,
  type HarnessRunResult,
  type SendConfirmEvidence,
  type TurnCounts,
  DEFAULT_HARNESS_TIMEOUTS,
} from './lifecycle';
import type { BrowserConversationSurfaceAdapter } from './surface-adapter';
import { buildRequestMarker } from './request-marker';
import {
  hashComposerText,
  normalizeComposerText,
  verifyComposerPayload,
} from '@shared/utils/notebook-composer-fill';
import { createHash } from 'node:crypto';

export interface BrowserConversationHarnessOptions {
  page: Page;
  adapter: BrowserConversationSurfaceAdapter;
  prompt: string;
  requestId?: string;
  timeouts?: Partial<HarnessPhaseTimeouts>;
  onState?: (state: BrowserConversationState, detail?: Record<string, unknown>) => void;
  isCancelled?: () => boolean;
}

function textHash(text: string): string {
  return createHash('sha256').update(normalizeComposerText(text), 'utf8').digest('hex').slice(0, 16);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared send → confirm → anchor → stabilize lifecycle for browser AI surfaces.
 * Invariant: never return pre-send assistant text when send is unconfirmed.
 */
export class BrowserConversationHarness {
  private state: BrowserConversationState = 'PREPARED';
  private sendEvidence: SendConfirmEvidence | null = null;
  private readonly diagnostics: Record<string, unknown> = {};
  private beforeSend: TurnCounts = { userTurns: 0, assistantTurns: 0 };
  private preSendAssistantHashes: string[] = [];

  async run(options: BrowserConversationHarnessOptions): Promise<HarnessRunResult> {
    const timeouts = { ...DEFAULT_HARNESS_TIMEOUTS, ...options.timeouts };
    const { page, adapter, prompt } = options;
    adapter.attach(page);

    const { requestId, marker, markedPrompt } = buildRequestMarker(options.requestId);
    this.diagnostics.provider = adapter.providerId;
    this.diagnostics.surface = adapter.surfaceName;

    this.transition('PREPARED', options);
    await this.assertNotCancelled(options);

    if (await adapter.detectLoginRequired()) {
      throw this.fail('LOGIN_REQUIRED', 'Session requires login', adapter, options);
    }
    if (await adapter.detectRateLimit()) {
      throw this.fail('QUOTA_LIMIT', 'Provider rate limit detected', adapter, options);
    }
    if (await adapter.detectBlockedOrSecurityChallenge()) {
      throw this.fail('UNKNOWN_UI', 'Security challenge or blocked UI', adapter, options);
    }

    const surface = await adapter.detectSurface();
    if (!surface.ok) {
      throw this.fail('UNKNOWN_UI', surface.reason, adapter, options);
    }

    const composer = await this.withTimeout(
      () => adapter.findComposer(),
      timeouts.composerMs,
      'Composer not found',
    );
    if (!composer.ok) {
      throw this.fail('UNKNOWN_UI', composer.reason, adapter, options);
    }
    this.diagnostics.composerSelector = composer.selector;
    this.transition('COMPOSER_FOUND', options);

    const filled = await adapter.fillComposer(markedPrompt(prompt));
    if (!filled.ok) {
      throw this.fail('COMPOSER_FILL_FAILED', filled.reason, adapter, options);
    }

    const composerText = await adapter.readComposerText();
    const verdict = verifyComposerPayload(markedPrompt(prompt), composerText);
    if (verdict !== 'ok') {
      this.diagnostics.composerVerdict = verdict;
      this.diagnostics.composerHash = hashComposerText(composerText);
      throw this.fail(
        'COMPOSER_FILL_FAILED',
        `Composer fill verification failed: ${verdict}`,
        adapter,
        options,
      );
    }
    if (!composerText.includes(marker)) {
      throw this.fail(
        'COMPOSER_FILL_FAILED',
        'Correlation marker missing from composer after fill',
        adapter,
        options,
      );
    }
    this.transition('PROMPT_FILLED', options);

    this.beforeSend = {
      userTurns: await adapter.countUserTurns(),
      assistantTurns: await adapter.countAssistantTurns(),
    };
    this.preSendAssistantHashes = await this.snapshotAssistantHashes(adapter, this.beforeSend.assistantTurns);
    this.diagnostics.turnCountsBefore = { ...this.beforeSend };

    const send = await adapter.clickSend();
    if (!send.ok) {
      throw this.fail('SEND_DISABLED', send.reason, adapter, options);
    }
    this.diagnostics.sendMethod = send.method;
    this.transition('SEND_CLICKED', options);

    this.sendEvidence = await this.waitForSendConfirmation(
      adapter,
      marker,
      this.beforeSend,
      timeouts.sendConfirmMs,
      options,
    );
    if (!this.sendEvidence) {
      await this.enforceNoStaleResponse(adapter, this.beforeSend, options);
      throw this.fail('SEND_NOT_CONFIRMED', 'No send confirmation evidence within timeout', adapter, options);
    }
    this.diagnostics.sendEvidence = this.sendEvidence;
    this.transition('SEND_CONFIRMED', options);

    const assistantIndex = await this.waitForAnchoredAssistant(
      adapter,
      marker,
      this.beforeSend,
      timeouts,
      options,
    );

    const text = await this.waitForStableResponse(adapter, assistantIndex, timeouts, options);
    this.transition('RESPONSE_CAPTURED', options);
    this.transition('COMPLETED', options);

    Object.assign(this.diagnostics, adapter.getDiagnostics());

    return {
      text,
      requestId,
      correlationId: requestId,
      finalState: 'COMPLETED',
      sendEvidence: this.sendEvidence,
      diagnostics: { ...this.diagnostics },
    };
  }

  private async waitForSendConfirmation(
    adapter: BrowserConversationSurfaceAdapter,
    marker: string,
    before: TurnCounts,
    timeoutMs: number,
    options: BrowserConversationHarnessOptions,
  ): Promise<SendConfirmEvidence | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await this.assertNotCancelled(options);
      const evidence = await adapter.detectSendConfirmation(before, marker);
      if (evidence) return evidence;
      await sleep(250);
    }
    return null;
  }

  private async waitForAnchoredAssistant(
    adapter: BrowserConversationSurfaceAdapter,
    marker: string,
    before: TurnCounts,
    timeouts: HarnessPhaseTimeouts,
    options: BrowserConversationHarnessOptions,
  ): Promise<number> {
    const start = Date.now();
    let generationStarted = false;

    while (Date.now() - start < timeouts.generationStartMs + timeouts.streamingMs) {
      await this.assertNotCancelled(options);

      const userIdx = await adapter.findUserTurnIndexByMarker(marker);
      if (userIdx >= 0) {
        const assistantIdx = await adapter.findAssistantIndexForUserTurn(userIdx);
        if (assistantIdx >= before.assistantTurns) {
          const text = await adapter.readAssistantText(assistantIdx);
          if (text.trim()) {
            this.transition(generationStarted ? 'RESPONSE_STREAMING' : 'RESPONSE_CREATED', options);
            return assistantIdx;
          }
        }
      }

      // Fallback: new assistant with content hash not seen before send
      const assistantCount = await adapter.countAssistantTurns();
      if (assistantCount > before.assistantTurns) {
        const idx = assistantCount - 1;
        const hash = await adapter.hashAssistantText(idx);
        const text = await adapter.readAssistantText(idx);
        if (text.trim() && hash && !this.preSendAssistantHashes.includes(hash)) {
          if (!generationStarted) {
            this.transition('GENERATION_STARTED', options);
            generationStarted = true;
          }
          this.transition('RESPONSE_CREATED', options);
          return idx;
        }
      }

      if (await adapter.isGenerating()) {
        if (!generationStarted) {
          this.transition('GENERATION_STARTED', options);
          generationStarted = true;
        }
      }

      await sleep(timeouts.stabilizationPollMs);
    }

    await this.enforceNoStaleResponse(adapter, before, options);
    throw this.fail('RESPONSE_NOT_FOUND', 'No new anchored assistant response', adapter, options);
  }

  private async waitForStableResponse(
    adapter: BrowserConversationSurfaceAdapter,
    assistantIndex: number,
    timeouts: HarnessPhaseTimeouts,
    options: BrowserConversationHarnessOptions,
  ): Promise<string> {
    const start = Date.now();
    let lastHash = '';
    let lastText = '';
    let quietSince = 0;

    while (Date.now() - start < timeouts.stabilizationMs) {
      await this.assertNotCancelled(options);

      const text = (await adapter.readAssistantText(assistantIndex)).trim();
      if (!text) {
        await sleep(timeouts.stabilizationPollMs);
        continue;
      }

      const hash = textHash(text);
      const generating = await adapter.isGenerating();

      if (generating) {
        this.transition('RESPONSE_STREAMING', options);
        lastText = text;
        lastHash = hash;
        quietSince = 0;
        await sleep(timeouts.stabilizationPollMs);
        continue;
      }

      if (hash === lastHash && text === lastText) {
        if (quietSince === 0) {
          this.transition('RESPONSE_STABILIZING', options);
          quietSince = Date.now();
        } else if (Date.now() - quietSince >= timeouts.stabilizationQuietMs) {
          return text;
        }
      } else {
        lastHash = hash;
        lastText = text;
        quietSince = 0;
      }

      await sleep(timeouts.stabilizationPollMs);
    }

    if (lastText) return lastText;
    throw this.fail('RESPONSE_TIMEOUT', 'Response stabilization timed out', adapter, options);
  }

  /** Absolute invariant: unconfirmed send must not return old assistant content. */
  private async enforceNoStaleResponse(
    adapter: BrowserConversationSurfaceAdapter,
    before: TurnCounts,
    options: BrowserConversationHarnessOptions,
  ): Promise<void> {
    const count = await adapter.countAssistantTurns();
    if (count <= before.assistantTurns) return;

    for (let i = before.assistantTurns; i < count; i += 1) {
      const hash = await adapter.hashAssistantText(i);
      const text = (await adapter.readAssistantText(i)).trim();
      if (text && hash && !this.preSendAssistantHashes.includes(hash)) {
        return;
      }
    }

    // Only old assistants exist — do not return them (caller throws).
    this.diagnostics.staleResponseBlocked = true;
    void options;
  }

  private async snapshotAssistantHashes(
    adapter: BrowserConversationSurfaceAdapter,
    count: number,
  ): Promise<string[]> {
    const hashes: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const h = await adapter.hashAssistantText(i);
      if (h) hashes.push(h);
    }
    return hashes;
  }

  private transition(state: BrowserConversationState, options: BrowserConversationHarnessOptions): void {
    this.state = state;
    options.onState?.(state, { ...this.diagnostics });
  }

  private async assertNotCancelled(options: BrowserConversationHarnessOptions): Promise<void> {
    if (options.isCancelled?.()) {
      await options.adapter.cancelGeneration();
      throw new AutomationError('GENERATION_ERROR', 'Generation cancelled');
    }
  }

  private async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new AutomationError('RESPONSE_TIMEOUT', message)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private fail(
    code: import('../types').AutomationErrorCode,
    message: string,
    adapter: BrowserConversationSurfaceAdapter,
    options: BrowserConversationHarnessOptions,
  ): AutomationError {
    void options;
    Object.assign(this.diagnostics, adapter.getDiagnostics());
    this.diagnostics.lifecycleState = this.state;
    this.diagnostics.pageUrl = options.page.url();
    return new AutomationError(code, message, {
      screenshotPath: null,
      htmlSnapshotPath: null,
      currentUrl: options.page.url(),
      operationName: 'browser_conversation_harness',
      errorCode: code,
      timestamp: new Date().toISOString(),
      surface: adapter.surfaceName,
      sendEvidence: this.sendEvidence,
      responseEvidence: this.diagnostics,
    });
  }
}
