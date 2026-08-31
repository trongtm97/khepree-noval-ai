import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  KHEPREE_AUTH_PROTOCOL_SCHEME,
  KHEPREE_OAUTH_REDIRECT_URI,
} from '@shared/constants/khepree';
import {
  OAuthAuthTransactionManager,
  parseAuthCallbackUrl,
  extractAuthCallbackUrlFromArgv,
} from '@main/khepree/oauth-auth-transaction';
import {
  KhepreeOAuthCallbackReplayError,
  KhepreeOAuthExpiredError,
  KhepreeOAuthStateMismatchError,
} from '@main/khepree/errors';

describe('parseAuthCallbackUrl', () => {
  it('accepts valid protocol callback', () => {
    const parsed = parseAuthCallbackUrl(
      `${KHEPREE_OAUTH_REDIRECT_URI}?code=abc&state=state-1`,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.result.code).toBe('abc');
      expect(parsed.result.state).toBe('state-1');
    }
  });

  it('rejects wrong protocol', () => {
    const parsed = parseAuthCallbackUrl('https://evil.example/callback?code=a&state=b');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe('OAUTH_WRONG_PROTOCOL');
  });

  it('rejects missing state', () => {
    const parsed = parseAuthCallbackUrl(`${KHEPREE_OAUTH_REDIRECT_URI}?code=abc`);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe('OAUTH_MISSING_STATE');
  });

  it('maps access_denied to cancelled', () => {
    const parsed = parseAuthCallbackUrl(
      `${KHEPREE_OAUTH_REDIRECT_URI}?error=access_denied&state=s1`,
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe('OAUTH_CANCELLED');
  });
});

describe('extractAuthCallbackUrlFromArgv', () => {
  it('finds protocol URL in argv', () => {
    const url = `${KHEPREE_AUTH_PROTOCOL_SCHEME}://auth/callback?code=x&state=y`;
    expect(extractAuthCallbackUrlFromArgv(['app.exe', url])).toBe(url);
  });
});

describe('OAuthAuthTransactionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves callback with matching state', async () => {
    const mgr = new OAuthAuthTransactionManager();
    mgr.beginTransaction('state-1', 'verifier-1');
    const waitPromise = mgr.waitForCallback('state-1');
    mgr.handleAuthCallbackUrl(`${KHEPREE_OAUTH_REDIRECT_URI}?code=code-1&state=state-1`);
    await expect(waitPromise).resolves.toEqual({ code: 'code-1', state: 'state-1' });
  });

  it('rejects state mismatch', async () => {
    const mgr = new OAuthAuthTransactionManager();
    mgr.beginTransaction('state-1', 'verifier-1');
    const waitPromise = mgr.waitForCallback('state-1');
    mgr.handleAuthCallbackUrl(`${KHEPREE_OAUTH_REDIRECT_URI}?code=code-1&state=other-state`);
    await expect(waitPromise).rejects.toBeInstanceOf(KhepreeOAuthStateMismatchError);
  });

  it('rejects callback replay', async () => {
    const mgr = new OAuthAuthTransactionManager();
    mgr.beginTransaction('state-1', 'verifier-1');
    const first = mgr.waitForCallback('state-1');
    mgr.handleAuthCallbackUrl(`${KHEPREE_OAUTH_REDIRECT_URI}?code=code-1&state=state-1`);
    await first;

    mgr.beginTransaction('state-2', 'verifier-2');
    const replay = mgr.waitForCallback('state-2');
    mgr.handleAuthCallbackUrl(`${KHEPREE_OAUTH_REDIRECT_URI}?code=code-1&state=state-1`);
    await expect(replay).rejects.toBeInstanceOf(KhepreeOAuthCallbackReplayError);
  });

  it('rejects expired pending login', async () => {
    const mgr = new OAuthAuthTransactionManager();
    mgr.beginTransaction('state-1', 'verifier-1', 1_000);
    const waitPromise = mgr.waitForCallback('state-1', 1_000);
    vi.advanceTimersByTime(1_500);
    mgr.handleAuthCallbackUrl(`${KHEPREE_OAUTH_REDIRECT_URI}?code=code-1&state=state-1`);
    await expect(waitPromise).rejects.toBeInstanceOf(KhepreeOAuthExpiredError);
  });

  it('clears verifier after transaction clear', () => {
    const mgr = new OAuthAuthTransactionManager();
    mgr.beginTransaction('state-1', 'verifier-1');
    expect(mgr.getCodeVerifier('state-1')).toBe('verifier-1');
    mgr.clearTransaction();
    expect(mgr.getCodeVerifier('state-1')).toBeNull();
  });
});
