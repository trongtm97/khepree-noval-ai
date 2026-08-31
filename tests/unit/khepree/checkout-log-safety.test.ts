import { describe, expect, it } from 'vitest';
import { redactCheckoutLogFields } from '@main/khepree/checkout-log-safety';

describe('checkout log safety', () => {
  it('redacts payment URLs and session ids', () => {
    const out = redactCheckoutLogFields({
      planId: 'pro-90d',
      checkoutUrl: 'https://account.khepree.com/checkout?secret=1',
      checkoutSessionId: 'sess-abc',
      cardNumber: '4111',
    });
    expect(out.planId).toBe('pro-90d');
    expect(out.checkoutUrl).toBe('[redacted]');
    expect(out.checkoutSessionId).toBe('[redacted]');
    expect(out.cardNumber).toBe('[redacted]');
  });
});
