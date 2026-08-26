import type { AutomationErrorCode } from '../types';
import { NON_RETRYABLE_ERROR_CODES, TRANSIENT_ERROR_CODES } from '../types';
import type { AutomationFailureDiagnostics } from '../protocol';

export class AutomationError extends Error {
  readonly code: AutomationErrorCode;
  readonly diagnostics?: AutomationFailureDiagnostics;

  constructor(
    code: AutomationErrorCode,
    message: string,
    diagnostics?: AutomationFailureDiagnostics,
  ) {
    super(message);
    this.name = 'AutomationError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export interface RetryPolicyOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RetryDecision {
  shouldRetry: boolean;
  attempt: number;
  delayMs: number;
  reason: string;
}

export class RetryPolicy {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: RetryPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maxDelayMs = options.maxDelayMs ?? 2000;
  }

  decide(code: AutomationErrorCode, attempt: number): RetryDecision {
    if (NON_RETRYABLE_ERROR_CODES.has(code)) {
      return {
        shouldRetry: false,
        attempt,
        delayMs: 0,
        reason: `non-retryable error ${code}`,
      };
    }

    if (!TRANSIENT_ERROR_CODES.has(code)) {
      return {
        shouldRetry: false,
        attempt,
        delayMs: 0,
        reason: `error ${code} not classified as transient`,
      };
    }

    if (attempt >= this.maxAttempts) {
      return {
        shouldRetry: false,
        attempt,
        delayMs: 0,
        reason: `max attempts (${this.maxAttempts}) reached`,
      };
    }

    const delayMs = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * 2 ** (attempt - 1),
    );

    return {
      shouldRetry: true,
      attempt,
      delayMs,
      reason: `transient error ${code}`,
    };
  }

  async run<T>(
    operationName: string,
    fn: (attempt: number) => Promise<T>,
    classify: (error: unknown) => AutomationErrorCode,
  ): Promise<T> {
    let attempt = 1;
    for (;;) {
      try {
        return await fn(attempt);
      } catch (error) {
        const code =
          error instanceof AutomationError ? error.code : classify(error);
        const decision = this.decide(code, attempt);
        if (!decision.shouldRetry) {
          if (error instanceof AutomationError) {
            throw error;
          }
          throw new AutomationError(
            code,
            error instanceof Error
              ? `${operationName}: ${error.message}`
              : `${operationName} failed`,
          );
        }
        await sleep(decision.delayMs);
        attempt += 1;
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
