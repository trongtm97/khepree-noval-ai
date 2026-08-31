import { describe, expect, it } from 'vitest';
import { computeCheckoutPollDelayMs } from '@main/khepree/checkout-poller';

describe('checkout poll backoff', () => {
  it('uses increasing delays, not 1s polling', () => {
    expect(computeCheckoutPollDelayMs(0)).toBe(3_000);
    expect(computeCheckoutPollDelayMs(1)).toBe(5_000);
    expect(computeCheckoutPollDelayMs(7)).toBe(60_000);
    expect(computeCheckoutPollDelayMs(99)).toBe(60_000);
  });
});
