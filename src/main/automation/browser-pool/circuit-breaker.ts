/**
 * Per provider/account circuit breaker + exponential backoff with jitter.
 * Never bypasses CAPTCHA/login — open circuit on attention states.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  openMs?: number;
  halfOpenSuccesses?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  jitterRatio?: number;
  now?: () => number;
  random?: () => number;
}

export interface CircuitSnapshot {
  key: string;
  state: CircuitState;
  failures: number;
  openUntil: number | null;
  consecutiveSuccesses: number;
}

interface CircuitEntry {
  failures: number;
  openUntil: number | null;
  consecutiveSuccesses: number;
  halfOpen: boolean;
}

const DEFAULTS = {
  failureThreshold: 5,
  openMs: 60_000,
  halfOpenSuccesses: 1,
  baseBackoffMs: 1_000,
  maxBackoffMs: 5 * 60_000,
  jitterRatio: 0.25,
} as const;

export class BrowserCircuitBreaker {
  private readonly entries = new Map<string, CircuitEntry>();
  private readonly opts: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.opts = {
      failureThreshold: options.failureThreshold ?? DEFAULTS.failureThreshold,
      openMs: options.openMs ?? DEFAULTS.openMs,
      halfOpenSuccesses: options.halfOpenSuccesses ?? DEFAULTS.halfOpenSuccesses,
      baseBackoffMs: options.baseBackoffMs ?? DEFAULTS.baseBackoffMs,
      maxBackoffMs: options.maxBackoffMs ?? DEFAULTS.maxBackoffMs,
      jitterRatio: options.jitterRatio ?? DEFAULTS.jitterRatio,
      now: options.now ?? (() => Date.now()),
      random: options.random ?? Math.random,
    };
  }

  key(providerId: string, accountId: string): string {
    return `${providerId}::${accountId}`;
  }

  canAttempt(providerId: string, accountId: string): boolean {
    const snap = this.snapshot(providerId, accountId);
    return snap.state !== 'open';
  }

  /** Suggested wait before next attempt (0 if closed/half-open). */
  backoffMs(providerId: string, accountId: string): number {
    const entry = this.get(providerId, accountId);
    const now = this.opts.now();
    if (entry.openUntil != null && entry.openUntil > now) {
      return entry.openUntil - now;
    }
    if (entry.failures <= 0) return 0;
    const exp = Math.min(
      this.opts.maxBackoffMs,
      this.opts.baseBackoffMs * 2 ** Math.min(entry.failures - 1, 8),
    );
    const jitter = exp * this.opts.jitterRatio * this.opts.random();
    return Math.floor(exp + jitter);
  }

  recordSuccess(providerId: string, accountId: string): void {
    const entry = this.get(providerId, accountId);
    if (entry.halfOpen) {
      entry.consecutiveSuccesses += 1;
      if (entry.consecutiveSuccesses >= this.opts.halfOpenSuccesses) {
        entry.failures = 0;
        entry.openUntil = null;
        entry.halfOpen = false;
        entry.consecutiveSuccesses = 0;
      }
      return;
    }
    entry.failures = 0;
    entry.openUntil = null;
    entry.consecutiveSuccesses = 0;
  }

  recordFailure(providerId: string, accountId: string, options?: { openImmediately?: boolean }): void {
    const entry = this.get(providerId, accountId);
    entry.failures += 1;
    entry.consecutiveSuccesses = 0;
    entry.halfOpen = false;
    if (options?.openImmediately || entry.failures >= this.opts.failureThreshold) {
      entry.openUntil = this.opts.now() + this.opts.openMs;
    }
  }

  /** Force open (CAPTCHA / login / blocked) — do not auto half-open until cleared. */
  tripForAttention(providerId: string, accountId: string, holdMs?: number): void {
    const entry = this.get(providerId, accountId);
    entry.failures = Math.max(entry.failures, this.opts.failureThreshold);
    entry.halfOpen = false;
    entry.consecutiveSuccesses = 0;
    entry.openUntil = this.opts.now() + (holdMs ?? this.opts.openMs * 10);
  }

  clear(providerId: string, accountId: string): void {
    this.entries.delete(this.key(providerId, accountId));
  }

  clearAll(): void {
    this.entries.clear();
  }

  snapshot(providerId: string, accountId: string): CircuitSnapshot {
    const entry = this.get(providerId, accountId);
    const now = this.opts.now();
    let state: CircuitState = 'closed';
    if (entry.openUntil != null && entry.openUntil > now) {
      state = 'open';
    } else if (entry.openUntil != null && entry.openUntil <= now && entry.failures > 0) {
      entry.halfOpen = true;
      entry.openUntil = null;
      state = 'half_open';
    } else if (entry.halfOpen) {
      state = 'half_open';
    }
    return {
      key: this.key(providerId, accountId),
      state,
      failures: entry.failures,
      openUntil: entry.openUntil,
      consecutiveSuccesses: entry.consecutiveSuccesses,
    };
  }

  private get(providerId: string, accountId: string): CircuitEntry {
    const k = this.key(providerId, accountId);
    let entry = this.entries.get(k);
    if (!entry) {
      entry = {
        failures: 0,
        openUntil: null,
        consecutiveSuccesses: 0,
        halfOpen: false,
      };
      this.entries.set(k, entry);
    }
    return entry;
  }
}

let singleton: BrowserCircuitBreaker | null = null;

export function getBrowserCircuitBreaker(): BrowserCircuitBreaker {
  singleton ??= new BrowserCircuitBreaker();
  return singleton;
}

export function resetBrowserCircuitBreakerForTests(): void {
  singleton = null;
}
