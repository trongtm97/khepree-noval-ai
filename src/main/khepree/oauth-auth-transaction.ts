import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import {
  KHEPREE_AUTH_PROTOCOL_SCHEME,
  KHEPREE_OAUTH_CALLBACK_HOST,
  KHEPREE_OAUTH_CALLBACK_RELATIVE_PATH,
  KHEPREE_OAUTH_REDIRECT_URI,
} from '@shared/constants/khepree';
import { logger } from '../logging/logger';
import {
  KhepreeAccessError,
  KhepreeOAuthCallbackReplayError,
  KhepreeOAuthExpiredError,
  KhepreeOAuthStateMismatchError,
} from './errors';

export interface OAuthCallbackResult {
  code: string;
  state: string;
}

export interface PendingOAuthTransaction {
  state: string;
  codeVerifier: string;
  expiresAt: number;
}

type ParseFailure = { ok: false; code: string; message: string };
type ParseSuccess = { ok: true; result: OAuthCallbackResult };

export function parseAuthCallbackUrl(rawUrl: string): ParseSuccess | ParseFailure {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, code: 'OAUTH_MALFORMED_URL', message: 'Malformed callback URL' };
  }

  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (scheme !== KHEPREE_AUTH_PROTOCOL_SCHEME) {
    return { ok: false, code: 'OAUTH_WRONG_PROTOCOL', message: 'Unexpected protocol' };
  }

  if (url.hostname !== KHEPREE_OAUTH_CALLBACK_HOST || url.pathname !== KHEPREE_OAUTH_CALLBACK_RELATIVE_PATH) {
    return { ok: false, code: 'OAUTH_WRONG_PATH', message: 'Unexpected callback path' };
  }

  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    if (oauthError === 'access_denied') {
      return { ok: false, code: 'OAUTH_CANCELLED', message: 'Sign-in cancelled' };
    }
    return { ok: false, code: 'OAUTH_FAILED', message: `OAuth error: ${oauthError}` };
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!state) {
    return { ok: false, code: 'OAUTH_MISSING_STATE', message: 'Missing state parameter' };
  }
  if (!code) {
    return { ok: false, code: 'OAUTH_MISSING_CODE', message: 'Missing code parameter' };
  }

  return { ok: true, result: { code, state } };
}

export function extractAuthCallbackUrlFromArgv(argv: string[]): string | null {
  const prefix = `${KHEPREE_AUTH_PROTOCOL_SCHEME}://`;
  for (const arg of argv) {
    if (arg.toLowerCase().startsWith(prefix)) {
      return arg;
    }
  }
  return null;
}

export function buildPendingOAuthState(): string {
  return randomUUID();
}

export class OAuthAuthTransactionManager {
  private pending: PendingOAuthTransaction | null = null;
  private consumedStates = new Set<string>();
  private waiter: {
    expectedState: string;
    resolve: (result: OAuthCallbackResult) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null = null;

  get redirectUri(): string {
    return KHEPREE_OAUTH_REDIRECT_URI;
  }

  beginTransaction(state: string, codeVerifier: string, ttlMs = 5 * 60 * 1000): void {
    this.clearTransaction();
    this.pending = {
      state,
      codeVerifier,
      expiresAt: Date.now() + ttlMs,
    };
  }

  getCodeVerifier(state: string): string | null {
    if (!this.pending || this.pending.state !== state) {
      return null;
    }
    if (Date.now() > this.pending.expiresAt) {
      return null;
    }
    return this.pending.codeVerifier;
  }

  clearTransaction(): void {
    if (this.waiter) {
      clearTimeout(this.waiter.timeoutId);
      this.waiter = null;
    }
    this.pending = null;
  }

  waitForCallback(expectedState: string, timeoutMs = 5 * 60 * 1000): Promise<OAuthCallbackResult> {
    if (this.waiter) {
      return Promise.reject(new KhepreeAccessError('OAUTH_BUSY', 'OAuth login already waiting'));
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.waiter = null;
        reject(new KhepreeOAuthExpiredError());
      }, timeoutMs);
      this.waiter = { expectedState, resolve, reject, timeoutId };
    });
  }

  handleAuthCallbackUrl(rawUrl: string): void {
    const parsed = parseAuthCallbackUrl(rawUrl);
    if (!parsed.ok) {
      logger.warn('Khepree OAuth callback rejected', { code: parsed.code });
      this.waiter?.reject(new KhepreeAccessError(parsed.code, parsed.message));
      return;
    }

    const { code, state } = parsed.result;

    if (this.consumedStates.has(state)) {
      logger.warn('Khepree OAuth callback replay rejected', { statePrefix: state.slice(0, 8) });
      this.waiter?.reject(new KhepreeOAuthCallbackReplayError());
      return;
    }

    if (!this.pending || Date.now() > this.pending.expiresAt) {
      this.waiter?.reject(new KhepreeOAuthExpiredError());
      return;
    }

    if (state !== this.pending.state || (this.waiter && state !== this.waiter.expectedState)) {
      logger.warn('Khepree OAuth state mismatch', { statePrefix: state.slice(0, 8) });
      this.waiter?.reject(new KhepreeOAuthStateMismatchError());
      return;
    }

    this.consumedStates.add(state);
    if (this.waiter) {
      clearTimeout(this.waiter.timeoutId);
      this.waiter.resolve({ code, state });
      this.waiter = null;
    }
  }
}
