import { app } from 'electron';
import { KHEPREE_EXTERNAL_URLS, KHEPREE_PRODUCT_ID } from '@shared/constants/khepree';
import { getDevSigningKeys } from './dev-signing-keys';

/** Pinned production endpoints — renderer cannot override these. */
export const KHEPREE_ENDPOINTS = {
  api: 'https://api.khepree.com/v1',
  website: KHEPREE_EXTERNAL_URLS.website,
  account: KHEPREE_EXTERNAL_URLS.account,
} as const;

/** Desktop OAuth client — override in dev via KHEPREE_OAUTH_CLIENT_ID. */
export const KHEPREE_OAUTH_CLIENT_ID_DEFAULT = 'khepree-novel-ai-desktop' as const;

/** Trusted Khepree Ed25519 public keys pinned at build time (keyId → SPKI base64). */
export const KHEPREE_TRUSTED_SIGNING_KEYS: Readonly<Record<string, string>> = {
  // Replace with production Khepree signing public key before release.
  k1: '',
};

export function getKhepreeApiBaseUrl(): string {
  if (app?.isPackaged) {
    return KHEPREE_ENDPOINTS.api;
  }
  const override = process.env.KHEPREE_API_BASE?.trim();
  return override && override.length > 0 ? override : KHEPREE_ENDPOINTS.api;
}

export function isKhepreeDevMockEnabled(): boolean {
  if (app?.isPackaged) {
    return false;
  }
  return process.env.KHEPREE_DEV_MOCK === '1' || process.env.KHEPREE_DEV_MOCK === 'true';
}

export function getKhepreeProductId(): string {
  if (app?.isPackaged) {
    return KHEPREE_PRODUCT_ID;
  }
  const override = process.env.KHEPREE_PRODUCT_ID?.trim();
  return override && override.length > 0 ? override : KHEPREE_PRODUCT_ID;
}

export function getKhepreeOAuthClientId(): string {
  if (app?.isPackaged) {
    return KHEPREE_OAUTH_CLIENT_ID_DEFAULT;
  }
  const override = process.env.KHEPREE_OAUTH_CLIENT_ID?.trim();
  return override && override.length > 0 ? override : KHEPREE_OAUTH_CLIENT_ID_DEFAULT;
}

export function buildKhepreeAuthorizeUrl(input: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
  installationId: string;
  productId: string;
}): string {
  const url = new URL('/oauth/authorize', KHEPREE_ENDPOINTS.account);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('installation_id', input.installationId);
  url.searchParams.set('product_id', input.productId);
  return url.toString();
}

export function resolveTrustedSigningKey(keyId: string): string | null {
  const pinned = KHEPREE_TRUSTED_SIGNING_KEYS[keyId];
  if (pinned && pinned.length > 0) {
    return pinned;
  }
  if (!isKhepreeDevMockEnabled()) {
    return null;
  }
  const dev = getDevSigningKeys();
  if (dev?.keyId === keyId) {
    return dev.publicKeySpki;
  }
  return null;
}
