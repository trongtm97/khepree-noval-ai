import { describe, expect, it } from 'vitest';
import {
  redactSecretsInString,
  sanitizeIpcErrorMessage,
  sanitizeLogContext,
  sanitizeUrlForLog,
} from '@main/security/log-sanitize';

describe('log sanitize', () => {
  it('redacts OAuth query params in URLs', () => {
    const out = sanitizeUrlForLog(
      'https://account.khepree.com/oauth/callback?code=secret-code&state=abc123',
    );
    expect(out).toContain('code=%5Bredacted%5D');
    expect(out).not.toContain('secret-code');
  });

  it('redacts bearer tokens in strings', () => {
    expect(redactSecretsInString('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9')).toContain(
      'Bearer [REDACTED]',
    );
  });

  it('redacts sensitive log context keys', () => {
    const out = sanitizeLogContext({
      planId: 'pro',
      refreshToken: 'rt-secret',
      authorization: 'Bearer x',
    });
    expect(out.planId).toBe('pro');
    expect(out.refreshToken).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
  });

  it('truncates IPC error messages', () => {
    const long = 'x'.repeat(600);
    expect(sanitizeIpcErrorMessage(long).length).toBeLessThanOrEqual(500);
  });
});
