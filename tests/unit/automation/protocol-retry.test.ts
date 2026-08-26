import { describe, it, expect } from 'vitest';
import {
  parseAutomationCommand,
  parseAutomationResult,
  AutomationCommandSchema,
} from '@main/automation/protocol';
import {
  RetryPolicy,
  AutomationError,
} from '@main/automation/errors/automation-errors';
import { sanitizeHtmlSnapshot } from '@main/automation/diagnostics';
import { TRANSIENT_ERROR_CODES, NON_RETRYABLE_ERROR_CODES } from '@main/automation/types';

describe('automation protocol', () => {
  it('parses supported commands', () => {
    const open = parseAutomationCommand({
      id: '1',
      type: 'OPEN',
      profilePath: 'C:/profiles/w1',
      headless: true,
    });
    expect(open.type).toBe('OPEN');

    expect(
      AutomationCommandSchema.parse({
        id: '2',
        type: 'NAVIGATE',
        url: 'https://example.com/',
      }).type,
    ).toBe('NAVIGATE');

    expect(parseAutomationCommand({ id: '3', type: 'GET_STATUS' }).type).toBe('GET_STATUS');
    expect(parseAutomationCommand({ id: '4', type: 'SCREENSHOT', tag: 'x' }).type).toBe(
      'SCREENSHOT',
    );
    expect(parseAutomationCommand({ id: '5', type: 'CLOSE' }).type).toBe('CLOSE');
    expect(parseAutomationCommand({ id: '6', type: 'RESTART' }).type).toBe('RESTART');
  });

  it('rejects invalid commands', () => {
    expect(() =>
      parseAutomationCommand({ id: '1', type: 'SEND_PROMPT', prompt: 'hi' }),
    ).toThrow();
  });

  it('parses failure result with diagnostics', () => {
    const result = parseAutomationResult({
      id: '1',
      ok: false,
      state: 'ERROR',
      errorCode: 'NAVIGATION_TIMEOUT',
      errorMessage: 'timeout',
      diagnostics: {
        screenshotPath: '/tmp/a.png',
        htmlSnapshotPath: '/tmp/a.html',
        currentUrl: 'https://example.com',
        operationName: 'NAVIGATE',
        timestamp: '2026-08-23T00:00:00.000Z',
      },
    });
    expect(result.diagnostics?.screenshotPath).toContain('a.png');
  });
});

describe('RetryPolicy', () => {
  it('retries transient errors with backoff', async () => {
    const policy = new RetryPolicy({ maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 });
    let attempts = 0;
    const value = await policy.run(
      'test',
      () => {
        attempts += 1;
        if (attempts < 3) {
          return Promise.reject(new AutomationError('NETWORK_ERROR', 'flake'));
        }
        return Promise.resolve('ok');
      },
      () => 'NETWORK_ERROR',
    );
    expect(value).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry authentication errors', async () => {
    const policy = new RetryPolicy({ maxAttempts: 5, baseDelayMs: 1 });
    await expect(
      policy.run(
        'auth',
        () => Promise.reject(new AutomationError('LOGIN_REQUIRED', 'login')),
        () => 'LOGIN_REQUIRED',
      ),
    ).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });

    expect(TRANSIENT_ERROR_CODES.has('LOGIN_REQUIRED')).toBe(false);
    expect(NON_RETRYABLE_ERROR_CODES.has('CAPTCHA')).toBe(true);
  });
});

describe('diagnostics sanitize', () => {
  it('redacts cookies/tokens and truncates', () => {
    const html = `<html><script>const access_token="secret"</script><body>cookie=abc Bearer xyz</body></html>${'x'.repeat(80_000)}`;
    const cleaned = sanitizeHtmlSnapshot(html);
    expect(cleaned).not.toContain('secret');
    expect(cleaned.toLowerCase()).toContain('[redacted]');
    expect(Buffer.byteLength(cleaned, 'utf8')).toBeLessThanOrEqual(64 * 1024 + 50);
  });
});
