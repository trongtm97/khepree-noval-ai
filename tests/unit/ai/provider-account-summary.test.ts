import { describe, expect, it } from 'vitest';
import { summarizeLinkedAiAccount } from '../../../src/main/ai/provider-account-summary';

describe('summarizeLinkedAiAccount', () => {
  it('returns nulls when provider has no accounts', () => {
    expect(summarizeLinkedAiAccount([])).toEqual({
      accountEmail: null,
      lastUsedAt: null,
      lastError: null,
    });
  });

  it('prefers READY account over first row', () => {
    expect(
      summarizeLinkedAiAccount([
        {
          status: 'LOGIN_REQUIRED',
          google_email: 'old@example.com',
          last_used_at: 'a',
          last_error: 'login',
        },
        {
          status: 'READY',
          google_email: 'ready@example.com',
          last_used_at: 'b',
          last_error: null,
        },
      ]),
    ).toEqual({
      accountEmail: 'ready@example.com',
      lastUsedAt: 'b',
      lastError: null,
    });
  });
});
