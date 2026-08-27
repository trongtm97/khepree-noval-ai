import type { Locator, Page } from 'playwright';
import { AutomationError } from '../../errors/automation-errors';
import type { AutomationErrorCode } from '../../types';
import {
  DEFAULT_DOM_POLL_INTERVAL_MS,
  DEFAULT_STABILIZATION_WINDOW_MS,
  NO_INDICATOR_STABILIZATION_WINDOW_MS,
} from '@shared/constants/gemini';
import { isGeminiSoftErrorText } from '@shared/utils/gemini-soft-error';

/**
 * Target-response generation lifecycle (not global-spinner driven).
 *
 * SEND_CONFIRMED → GENERATION_STARTED → RESPONSE_CREATED →
 * RESPONSE_STREAMING → RESPONSE_STABILIZING → RESPONSE_COMPLETE
 */
export const GENERATION_PHASES = [
  'SEND_CONFIRMED',
  'GENERATION_STARTED',
  'RESPONSE_CREATED',
  'RESPONSE_STREAMING',
  'RESPONSE_STABILIZING',
  'RESPONSE_COMPLETE',
] as const;

export type GenerationPhase = (typeof GENERATION_PHASES)[number];

export { NO_INDICATOR_STABILIZATION_WINDOW_MS };

export interface GenerationLifecycleOptions {
  maxTimeoutMs: number;
  /** Base quiet window when a generating indicator is visible/known. */
  stabilizationWindowMs?: number;
  /** Quiet window when no indicator exists (default 6s). */
  noIndicatorStabilizationWindowMs?: number;
  pollIntervalMs?: number;
  /** Resolve / re-resolve the anchored target assistant locator. */
  resolveTarget: () => Promise<Locator | null>;
  /** Read sanitized text from the current target only. */
  readTargetText: () => Promise<string>;
  /**
   * True while a generating indicator is active for this turn.
   * Return `null` when no indicator can be observed (forces longer quiet window).
   */
  readGeneratingIndicator: () => Promise<boolean | null>;
  isCancelled?: () => boolean;
  /** Lifecycle already past GENERATION_STARTED (target known). */
  initialPhase?: GenerationPhase;
  onPhase?: (phase: GenerationPhase, detail?: Record<string, unknown>) => void;
}

export interface GenerationLifecycleResult {
  text: string;
  phase: GenerationPhase;
  usedNoIndicatorWindow: boolean;
  /** True when quiet window elapsed but protocol/tags look truncated. */
  incomplete?: boolean;
}

function waitForNextPoll(pollIntervalMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, pollIntervalMs);
  });
}

/**
 * Detect UI / model error copy in the target response (not soft-error helpers alone).
 * Returns a specific automation code when matched.
 */
export function detectGenerationUiError(text: string): AutomationErrorCode | null {
  const t = text.trim();
  if (!t) return null;
  if (/<(TRANSLATION|TERM_DELTA|MEMORY_DELTA)>/i.test(t)) return null;
  if (/\[C\d{6}:P\d{6}\]/.test(t)) return null;

  if (/accounts\.google\.com|sign in|login required|đăng nhập/i.test(t)) {
    return 'LOGIN_REQUIRED';
  }
  if (/quota|rate limit|limit reached|đã hết hạn mức/i.test(t)) {
    return 'QUOTA_LIMIT';
  }
  if (
    /network error|failed to (fetch|connect)|connection (lost|error)|offline/i.test(t)
  ) {
    return 'NETWORK_ERROR';
  }
  if (
    /something went wrong|generation stopped|response blocked|please try again|retry|unable to (process|complete)|đã xảy ra lỗi|thử lại/i.test(
      t,
    ) ||
    isGeminiSoftErrorText(t)
  ) {
    return 'GENERATION_ERROR';
  }
  return null;
}

/**
 * Protocol / shape checks for truncated model output.
 * True ⇒ do not declare COMPLETED.
 */
export function detectOutputIncomplete(text: string): boolean {
  const t = text.trim();
  if (!t) return true;

  if (/<TRANSLATION\b[^>]*>/i.test(t) && !/<\/TRANSLATION>/i.test(t)) {
    return true;
  }
  if (/<TERM_DELTA\b[^>]*>/i.test(t) && !/<\/TERM_DELTA>/i.test(t)) {
    return true;
  }
  if (/<MEMORY_DELTA\b[^>]*>/i.test(t) && !/<\/MEMORY_DELTA>/i.test(t)) {
    return true;
  }

  // Truncated JSON inside TERM_DELTA / MEMORY_DELTA bodies.
  for (const m of t.matchAll(/<(TERM_DELTA|MEMORY_DELTA)>\s*([\s\S]*?)(?:<\/\1>|$)/gi)) {
    const body = (m[2] ?? '').trim();
    if (!body || !/^[\[{]/.test(body)) continue;
    const opens = (body.match(/[\[{]/g) ?? []).length;
    const closes = (body.match(/[\]}]/g) ?? []).length;
    if (opens > closes) return true;
    if (/[,:]\s*$/.test(body) || /"[^"]*$/.test(body)) return true;
  }

  // Trailing incomplete paragraph id / mid-tag cutoff.
  if (/\[[Cc]\d{0,6}:[Pp]\d{0,6}$/.test(t) || /\[[Cc]\d{6}:[Pp]\d{0,5}$/.test(t)) {
    return true;
  }
  if (/<[A-Z_/]*$/i.test(t)) {
    return true;
  }
  const lastLine = t.split('\n').pop() ?? '';
  if (/\[[Cc]\d+:[Pp]\d+[^\]]*$/.test(lastLine)) {
    return true;
  }

  return false;
}

/**
 * Drive the generation lifecycle by observing the anchored target response only.
 * Does not use long sleep as the source of truth — polls with short intervals.
 */
export async function runTargetGenerationLifecycle(
  options: GenerationLifecycleOptions,
): Promise<GenerationLifecycleResult> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_DOM_POLL_INTERVAL_MS;
  const baseWindow =
    options.stabilizationWindowMs ?? DEFAULT_STABILIZATION_WINDOW_MS;
  const noIndicatorWindow =
    options.noIndicatorStabilizationWindowMs ?? NO_INDICATOR_STABILIZATION_WINDOW_MS;

  let phase: GenerationPhase = options.initialPhase ?? 'RESPONSE_CREATED';
  if (options.initialPhase) {
    options.onPhase?.(phase);
  }

  const started = Date.now();
  let lastText = '';
  let lastChangeAt = Date.now();
  let sawTarget = options.initialPhase === 'RESPONSE_CREATED' ||
    options.initialPhase === 'RESPONSE_STREAMING' ||
    options.initialPhase === 'RESPONSE_STABILIZING';
  let sawNonEmpty = false;
  let usedNoIndicatorWindow = false;
  let everSawIndicator: boolean | null = null;

  while (Date.now() - started < options.maxTimeoutMs) {
    if (options.isCancelled?.()) {
      throw new AutomationError('RESPONSE_TIMEOUT', 'Generation cancelled');
    }

    const target = await options.resolveTarget();
    if (!target) {
      await waitForNextPoll(pollIntervalMs);
      continue;
    }

    if (!sawTarget) {
      sawTarget = true;
      phase = 'RESPONSE_CREATED';
      options.onPhase?.(phase);
    }

    const indicator = await options.readGeneratingIndicator();
    if (indicator !== null) {
      everSawIndicator = everSawIndicator === true || indicator;
    }

    const text = await options.readTargetText();
    const uiError = detectGenerationUiError(text);
    if (uiError) {
      throw new AutomationError(uiError, `Generation failed in target response: ${uiError}`);
    }

    if (text !== lastText) {
      lastText = text;
      lastChangeAt = Date.now();
      if (text.length > 0) {
        sawNonEmpty = true;
        if (phase !== 'RESPONSE_STREAMING' && phase !== 'RESPONSE_STABILIZING') {
          phase = 'RESPONSE_STREAMING';
          options.onPhase?.(phase, { length: text.length });
        } else if (phase === 'RESPONSE_STABILIZING') {
          phase = 'RESPONSE_STREAMING';
          options.onPhase?.(phase, { length: text.length, resumed: true });
        }
      }
    }

    const generatingActive = indicator === true;
    const noIndicatorObservable = indicator === null || everSawIndicator === false;
    const requiredWindow = noIndicatorObservable ? noIndicatorWindow : baseWindow;
    if (noIndicatorObservable) {
      usedNoIndicatorWindow = true;
    }

    if (sawNonEmpty && text.length > 0 && !generatingActive) {
      const stableFor = Date.now() - lastChangeAt;
      if (stableFor >= requiredWindow * 0.4 && phase !== 'RESPONSE_STABILIZING') {
        phase = 'RESPONSE_STABILIZING';
        options.onPhase?.(phase, {
          stableForMs: stableFor,
          requiredWindowMs: requiredWindow,
        });
      }
      if (stableFor >= requiredWindow) {
        if (detectOutputIncomplete(text)) {
          // Incomplete protocol while quiet — likely mid-stream pause or cutoff.
          // Do not COMPLETE; keep waiting until more tokens or maxTimeout.
          await waitForNextPoll(pollIntervalMs);
          continue;
        }
        phase = 'RESPONSE_COMPLETE';
        options.onPhase?.(phase, {
          length: text.length,
          usedNoIndicatorWindow,
        });
        return { text, phase, usedNoIndicatorWindow };
      }
    }

    await waitForNextPoll(pollIntervalMs);
  }

  if (sawNonEmpty && detectOutputIncomplete(lastText)) {
    return {
      text: lastText,
      phase: 'RESPONSE_STABILIZING',
      usedNoIndicatorWindow,
      incomplete: true,
    };
  }

  throw new AutomationError(
    'RESPONSE_TIMEOUT',
    `Target response did not complete within ${options.maxTimeoutMs}ms (lastPhase=${phase})`,
  );
}

/** Optional aria-busy / live-region check on a target locator. */
export async function targetLooksBusy(target: Locator): Promise<boolean | null> {
  try {
    return await target.evaluate((el) => {
      const busy =
        el.getAttribute('aria-busy') === 'true' ||
        el.getAttribute('data-streaming') === '1' ||
        el.getAttribute('data-generating') === '1';
      if (busy) return true;
      const live = el.closest('[aria-busy="true"], [aria-live="polite"], [aria-live="assertive"]');
      if (live?.getAttribute('aria-busy') === 'true') return true;
      return false;
    });
  } catch {
    return null;
  }
}

export async function pageHasGeneratingIndicator(page: Page): Promise<boolean | null> {
  try {
    const hit = await page.evaluate(() => {
      const stop = document.querySelector(
        '[data-testid="stop-generation"], [data-action="stop-generation"], button[aria-label*="Stop" i]',
      );
      if (stop) {
        const style = window.getComputedStyle(stop);
        if (style.display !== 'none' && style.visibility !== 'hidden') return true;
      }
      const loading = document.querySelector(
        '[data-testid="loading-indicator"][data-generating="1"], [data-generating="1"], [aria-busy="true"]',
      );
      if (loading) {
        const style = window.getComputedStyle(loading as Element);
        if (style.display !== 'none' && style.visibility !== 'hidden') return true;
      }
      const streaming = document.querySelector('[data-streaming="1"]');
      return Boolean(streaming);
    });
    return hit;
  } catch {
    return null;
  }
}
