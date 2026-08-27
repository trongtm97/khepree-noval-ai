import type { Locator, Page } from 'playwright';
import { AutomationError } from '../../../errors/automation-errors';
import { captureFailureDiagnostics } from '../../../diagnostics';
import {
  describeStrategy,
  mergeStrategies,
  type SelectorStrategy,
} from '../../../selectors/selector-strategy';
import { getOverrideForSelector } from '../../../selectors/selector-override-loader';
import {
  fastProbeResolve,
  isProbeWinner,
  isEditableComposerLocator,
} from '../../../selectors/fast-probe-resolver';
import {
  captureUnknownSurfaceDiagnostics,
  detectUiSurface,
  type SurfaceDetectionResult,
} from '../surface/surface-detector';
import {
  CHAT_SURFACES,
  overrideProviderIdForSurface,
  type UiSurface,
} from '../surface/surface-ids';
import type { ChatSelectorCatalog, ChatSelectorKey } from './chat-selector-keys';
import { CHAT_SELECTOR_KEYS } from './chat-selector-keys';
import { GEMINI_CHAT_SELECTORS } from './gemini-chat.selectors';
import { GEMINI_NOTEBOOK_SELECTORS } from './gemini-notebook.selectors';
import { NOTEBOOKLM_SELECTORS } from './notebooklm.selectors';

export type { SelectorStrategy, ChatSelectorKey, UiSurface };
export type { SelectorEntry } from './chat-selector-keys';

/** @deprecated Prefer surface-specific catalogs; kept for older imports/tests. */
export const GOOGLE_GEMINI_SELECTORS = NOTEBOOKLM_SELECTORS;

export type GeminiSelectorKey = ChatSelectorKey;

export interface SelectorStrategyWinLog {
  surface: UiSurface;
  operation: string;
  strategyId: string;
  durationMs: number;
  fallbackDepth: number;
  score: number;
}

export type StrategyWinLogger = (entry: SelectorStrategyWinLog) => void;

function catalogForSurface(surface: UiSurface): ChatSelectorCatalog {
  switch (surface) {
    case 'GEMINI_CHAT':
      return GEMINI_CHAT_SELECTORS;
    case 'GEMINI_NOTEBOOK':
      return GEMINI_NOTEBOOK_SELECTORS;
    case 'NOTEBOOKLM':
      return NOTEBOOKLM_SELECTORS;
    case 'GOOGLE_LOGIN':
    case 'UNKNOWN':
    default:
      // Conservative default for fixtures mid-detect; still surface-scoped after detect.
      return GEMINI_CHAT_SELECTORS;
  }
}

/**
 * Surface-aware Gemini / NotebookLM chat selector registry.
 * Detects UI surface once, then resolves only that surface's catalog via fast probe.
 */
export class GeminiSelectorRegistry {
  private cachedDetection: SurfaceDetectionResult | null = null;
  private unknownDiagnosticsCaptured = false;

  constructor(
    private readonly page: Page,
    private readonly diagnosticsDir: string,
    private readonly onStrategyWin?: StrategyWinLogger,
  ) {}

  getSurface(): UiSurface | null {
    return this.cachedDetection?.surface ?? null;
  }

  getDetection(): SurfaceDetectionResult | null {
    return this.cachedDetection;
  }

  async ensureSurface(): Promise<UiSurface> {
    if (this.cachedDetection) {
      return this.cachedDetection.surface;
    }
    const detection = await detectUiSurface(this.page);
    this.cachedDetection = detection;
    if (detection.surface === 'UNKNOWN' && !this.unknownDiagnosticsCaptured) {
      this.unknownDiagnosticsCaptured = true;
      await captureUnknownSurfaceDiagnostics({
        page: this.page,
        diagnosticsDir: this.diagnosticsDir,
        detection,
      });
    }
    return detection.surface;
  }

  invalidateSurfaceCache(): void {
    this.cachedDetection = null;
  }

  private async catalog(): Promise<ChatSelectorCatalog> {
    const surface = await this.ensureSurface();
    return catalogForSurface(surface);
  }

  private async strategiesFor(key: ChatSelectorKey): Promise<SelectorStrategy[]> {
    const surface = await this.ensureSurface();
    const entry = (await this.catalog())[key];
    const surfaceProvider = overrideProviderIdForSurface(surface);
    const override =
      getOverrideForSelector(surfaceProvider, key) ??
      getOverrideForSelector('google-gemini', key);
    return mergeStrategies(
      [...entry.strategies],
      override?.strategies,
      override?.mode ?? 'prepend',
    );
  }

  /**
   * Resolve chat panel scope so composer/messages stay inside the correct panel.
   */
  async chatPanelScope(): Promise<Locator | null> {
    const surface = await this.ensureSurface();
    if (!CHAT_SURFACES.has(surface) && surface !== 'UNKNOWN') {
      return null;
    }
    const strategies = await this.strategiesFor('activeThread');
    const result = await fastProbeResolve({
      page: this.page,
      strategies,
      timeoutMs: 800,
      probeMs: 150,
      visible: true,
    });
    if (isProbeWinner(result)) {
      this.logWin('chatPanelScope', result);
      return result.locator;
    }
    return null;
  }

  async resolve(
    key: GeminiSelectorKey,
    options?: { timeoutMs?: number; visible?: boolean; editable?: boolean },
  ): Promise<Locator> {
    const surface = await this.ensureSurface();
    const catalog = await this.catalog();
    const entry = catalog[key];
    const timeoutMs = options?.timeoutMs ?? 2_500;
    const requireEditable = options?.editable === true || key === 'promptInput';
    const strategies = await this.strategiesFor(key);
    const candidates = strategies.map(describeStrategy);

    let scope: Locator | null = null;
    if (key === 'promptInput' || key === 'sendButton') {
      scope = await this.chatPanelScope();
    }

    const result = await fastProbeResolve({
      page: this.page,
      strategies,
      timeoutMs,
      probeMs: 200,
      visible: options?.visible,
      editable: requireEditable,
      scope: key === 'promptInput' ? scope : null,
      validateCandidate: requireEditable
        ? (loc) => isEditableComposerLocator(loc)
        : undefined,
    });

    // If scoped prompt failed, retry unscoped once (fixture may not nest composer).
    if (!isProbeWinner(result) && key === 'promptInput' && scope) {
      const unscoped = await fastProbeResolve({
        page: this.page,
        strategies,
        timeoutMs: Math.min(timeoutMs, 1_200),
        probeMs: 200,
        visible: options?.visible,
        editable: true,
      });
      if (isProbeWinner(unscoped)) {
        this.logWin(`resolve:${key}`, unscoped);
        return unscoped.locator;
      }
    }

    if (isProbeWinner(result)) {
      this.logWin(`resolve:${key}`, result);
      return result.locator;
    }

    const diagnostics = await captureFailureDiagnostics({
      page: this.page,
      diagnosticsDir: this.diagnosticsDir,
      operationName: `selector:${entry.key}`,
      tag: entry.key,
      selectorKey: entry.key,
      selectorCandidates: [
        `surface=${surface}`,
        ...candidates,
        `tried=${result.tried.join(' | ')}`,
      ],
    });

    throw new AutomationError(
      'SELECTOR_NOT_FOUND',
      `Selector not found: ${entry.key} on ${surface} (${entry.description}). Tried: ${result.tried.join(' | ')}`,
      diagnostics,
    );
  }

  async tryResolve(
    key: GeminiSelectorKey,
    options?: { timeoutMs?: number; visible?: boolean; editable?: boolean },
  ): Promise<Locator | null> {
    try {
      return await this.resolve(key, { ...options, timeoutMs: options?.timeoutMs ?? 800 });
    } catch (error: unknown) {
      if (error instanceof AutomationError && error.code === 'SELECTOR_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Logical assistant message containers — one locator strategy winner, no nested OR unions.
   * Prevents one bubble matching 3 union selectors and counting as 3 messages.
   */
  assistantResponses(): Locator {
    const surface = this.cachedDetection?.surface ?? 'UNKNOWN';
    return assistantLocatorForSurface(this.page, surface);
  }

  responseForCorrelation(correlationId: string): Locator {
    const escaped = correlationId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return this.page
      .locator(`[data-correlation-id="${escaped}"]`)
      .and(this.assistantResponses());
  }

  async isStreamingVisible(): Promise<boolean> {
    const loading = await this.tryResolve('loadingIndicator', { timeoutMs: 300 });
    if (!loading) return false;
    return loading.isVisible().catch(() => false);
  }

  async isAnyResponseStreaming(): Promise<boolean> {
    const streaming = this.page.locator('[data-streaming="1"]');
    return (await streaming.count()) > 0;
  }

  private logWin(
    operation: string,
    winner: {
      strategyId: string;
      durationMs: number;
      fallbackDepth: number;
      score: number;
    },
  ): void {
    const surface = this.cachedDetection?.surface ?? 'UNKNOWN';
    this.onStrategyWin?.({
      surface,
      operation,
      strategyId: winner.strategyId,
      durationMs: winner.durationMs,
      fallbackDepth: winner.fallbackDepth,
      score: winner.score,
    });
  }
}

/**
 * Single-strategy assistant locators per surface (no nested .or() of parent+child).
 */
export function assistantLocatorForSurface(page: Page, surface: UiSurface): Locator {
  const fixture = page
    .getByTestId('assistant-response')
    .or(page.locator('[data-assistant-response]'));

  switch (surface) {
    case 'GEMINI_CHAT':
      // Prefer role attribute containers; avoid OR-ing nested text nodes.
      return fixture.or(page.locator('[data-message-author-role="model"]'));
    case 'GEMINI_NOTEBOOK':
    case 'NOTEBOOKLM':
      // Outer logical bubble only (not .message-text-content inside).
      return fixture.or(page.locator('.chat-message-pair .to-user-container'));
    default:
      return fixture;
  }
}

/** Keys known for override schema validation. */
export function isKnownChatSelectorKey(key: string): boolean {
  return (CHAT_SELECTOR_KEYS as readonly string[]).includes(key);
}

// Re-export catalogs for tests / diagnostics
export { GEMINI_CHAT_SELECTORS } from './gemini-chat.selectors';
export { GEMINI_NOTEBOOK_SELECTORS } from './gemini-notebook.selectors';
export { NOTEBOOKLM_SELECTORS } from './notebooklm.selectors';
export { detectUiSurface } from '../surface/surface-detector';
export { UI_SURFACES } from '../surface/surface-ids';
