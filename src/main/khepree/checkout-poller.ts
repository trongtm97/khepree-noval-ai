import {
  KHEPREE_CHECKOUT_POLL_DELAYS_MS,
  KHEPREE_CHECKOUT_POLL_TIMEOUT_MS,
} from '@shared/constants/khepree';

export function computeCheckoutPollDelayMs(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), KHEPREE_CHECKOUT_POLL_DELAYS_MS.length - 1);
  return KHEPREE_CHECKOUT_POLL_DELAYS_MS[index];
}

export { KHEPREE_CHECKOUT_POLL_TIMEOUT_MS };

export class KhepreeCheckoutPoller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private startedAt = 0;
  private cancelled = false;

  constructor(
    private readonly onPoll: () => Promise<boolean>,
    private readonly onTimeout: () => void,
  ) {}

  start(): void {
    this.stop();
    this.cancelled = false;
    this.attempt = 0;
    this.startedAt = Date.now();
    this.scheduleNext();
  }

  stop(): void {
    this.cancelled = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Manual check — does not reset backoff timer chain. */
  async pollNow(): Promise<boolean> {
    if (this.cancelled) return false;
    return this.onPoll();
  }

  private scheduleNext(): void {
    if (this.cancelled) return;
    const elapsed = Date.now() - this.startedAt;
    if (elapsed >= KHEPREE_CHECKOUT_POLL_TIMEOUT_MS) {
      this.onTimeout();
      return;
    }
    const delay = computeCheckoutPollDelayMs(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runPoll();
    }, delay);
    this.timer.unref();
  }

  private async runPoll(): Promise<void> {
    if (this.cancelled) return;
    const done = await this.onPoll();
    if (done) return;
    this.scheduleNext();
  }
}
