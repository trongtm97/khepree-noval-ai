import {
  isGeminiLifecycleAtLeast,
  isTerminalGeminiLifecycle,
  type GeminiRequestLifecycle,
} from '@shared/constants/gemini';

/**
 * Page / disk probe used when recovering a crashed gemini_request.
 * Recovery never invents a resend after SENT_CONFIRMED without proving
 * the user prompt is absent from the thread.
 */
export interface GeminiRecoveryProbe {
  /** User message containing correlation marker found in Notebook/thread. */
  markerFound: boolean;
  /** Assistant bubble for this turn exists and is still streaming / busy. */
  generationActive: boolean;
  /** Assistant response text present and stable enough to capture. */
  responseComplete: boolean;
  /** Raw response already on disk (RESPONSE_CAPTURED+). */
  rawCaptured: boolean;
  /** Parsed output already applied (PARSED+). */
  parsed: boolean;
}

export type GeminiRecoveryAction =
  | { action: 'noop_complete'; reason: string }
  | { action: 'parse_existing'; reason: string }
  | { action: 'capture_response'; reason: string }
  | { action: 'wait_generation'; reason: string }
  | { action: 'search_thread'; reason: string }
  | {
      action: 'resend';
      reason: string;
      /** Only allowed when lifecycle < SENT_CONFIRMED and marker absent. */
    }
  | { action: 'fail'; reason: string };

/**
 * Pure recovery planner — crash-safe, idempotent.
 *
 * Rule: if DB says SENT_CONFIRMED (or later / UNKNOWN_AFTER_CRASH), never `resend`
 * unless probe proves marker absent *and* we somehow were below SENT_CONFIRMED
 * (impossible for UNKNOWN). For SENT_CONFIRMED+ with missing marker → fail/search,
 * not silent duplicate send.
 */
export function planGeminiRequestRecovery(
  lifecycle: GeminiRequestLifecycle,
  probe: GeminiRecoveryProbe,
): GeminiRecoveryAction {
  if (lifecycle === 'COMPLETED') {
    return { action: 'noop_complete', reason: 'Already COMPLETED' };
  }
  if (lifecycle === 'FAILED') {
    return { action: 'fail', reason: 'Request already FAILED — start a new attempt' };
  }

  if (lifecycle === 'PARSED') {
    return { action: 'noop_complete', reason: 'Parsed — mark COMPLETED' };
  }

  if (probe.parsed || lifecycle === 'RESPONSE_CAPTURED') {
    if (probe.rawCaptured || lifecycle === 'RESPONSE_CAPTURED') {
      return {
        action: 'parse_existing',
        reason: 'Raw captured — resume parse, do not resend',
      };
    }
  }

  if (probe.rawCaptured) {
    return {
      action: 'parse_existing',
      reason: 'Raw file present — resume parse, do not resend',
    };
  }

  const sentOrLater =
    isGeminiLifecycleAtLeast(lifecycle, 'SENT_CONFIRMED') ||
    lifecycle === 'UNKNOWN_AFTER_CRASH';

  if (sentOrLater) {
    if (probe.markerFound) {
      if (probe.generationActive) {
        return {
          action: 'wait_generation',
          reason: 'Prompt found; generation still active — wait, no resend',
        };
      }
      if (probe.responseComplete) {
        return {
          action: 'capture_response',
          reason: 'Prompt found; response complete — capture only',
        };
      }
      return {
        action: 'wait_generation',
        reason: 'Prompt found; waiting for assistant response — no resend',
      };
    }
    // SENT_CONFIRMED+ but marker not visible (virtualized / wrong thread)
    return {
      action: 'search_thread',
      reason:
        'SENT_CONFIRMED+ but marker not in view — reopen same notebook/thread and search; do not resend',
    };
  }

  // Before SENT_CONFIRMED: may resend only if prompt proven absent.
  if (probe.markerFound) {
    // Click happened / partial send — promote to confirmed path.
    if (probe.generationActive) {
      return {
        action: 'wait_generation',
        reason: 'Marker present before confirm — treat as sent, wait',
      };
    }
    if (probe.responseComplete) {
      return {
        action: 'capture_response',
        reason: 'Marker present before confirm — capture, no resend',
      };
    }
    return {
      action: 'wait_generation',
      reason: 'Marker present — do not duplicate send',
    };
  }

  if (isTerminalGeminiLifecycle(lifecycle)) {
    return { action: 'fail', reason: 'Terminal lifecycle' };
  }

  return {
    action: 'resend',
    reason: 'Prompt not found and never SENT_CONFIRMED — safe to send once',
  };
}

/** Crash classification for startup (no browser). */
export function classifyCrashLifecycle(
  lifecycle: GeminiRequestLifecycle,
): 'abandon_before_send' | 'unknown_after_sent' | 'terminal' {
  if (isTerminalGeminiLifecycle(lifecycle)) return 'terminal';
  if (
    isGeminiLifecycleAtLeast(lifecycle, 'SENT_CONFIRMED') ||
    lifecycle === 'UNKNOWN_AFTER_CRASH'
  ) {
    return 'unknown_after_sent';
  }
  return 'abandon_before_send';
}
