import type { Page } from 'playwright';
import { AutomationError } from '../../errors/automation-errors';

export interface StabilizationOptions {
  /** Max total wait before RESPONSE_TIMEOUT. */
  maxTimeoutMs: number;
  /** Text unchanged for this duration ⇒ stable. */
  stabilizationWindowMs: number;
  pollIntervalMs: number;
  /** Returns true while model is still streaming. */
  isStreaming: () => Promise<boolean>;
  /** Read current candidate response text. */
  readText: () => Promise<string>;
  /** Optional: abort early if generation cancelled. */
  isCancelled?: () => boolean;
}

/**
 * Wait until response text stops changing AND streaming indicators are off.
 * Avoids reading partial streamed output.
 */
export async function waitForStableResponse(
  options: StabilizationOptions,
): Promise<string> {
  const started = Date.now();
  let lastText = '';
  let lastChangeAt = Date.now();

  while (Date.now() - started < options.maxTimeoutMs) {
    if (options.isCancelled?.()) {
      throw new AutomationError('RESPONSE_TIMEOUT', 'Generation cancelled');
    }

    const streaming = await options.isStreaming();
    const text = await options.readText();

    if (text !== lastText) {
      lastText = text;
      lastChangeAt = Date.now();
    } else if (!streaming && text.length > 0) {
      const stableFor = Date.now() - lastChangeAt;
      if (stableFor >= options.stabilizationWindowMs) {
        return text;
      }
    }

    await waitForNextPoll(options.pollIntervalMs);
  }

  throw new AutomationError(
    'RESPONSE_TIMEOUT',
    `Response did not stabilize within ${options.maxTimeoutMs}ms`,
  );
}

/** Prefer short poll gaps; primary signal is DOM state, not fixed long sleeps. */
function waitForNextPoll(pollIntervalMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, pollIntervalMs);
  });
}

/** Wait until a DOM predicate becomes true (polls — supports async checks). */
export async function waitForDomState(
  page: Page,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<void> {
  void page;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await waitForNextPoll(100);
  }
  throw new AutomationError('RESPONSE_TIMEOUT', timeoutMessage);
}
