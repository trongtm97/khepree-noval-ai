import { app } from 'electron';
import {
  KHEPREE_ACCOUNT_AUTHORIZE_PATH,
  KHEPREE_EXTERNAL_URLS,
  KHEPREE_PRODUCT_SLUG,
  KHEPREE_PRODUCTION,
} from '@shared/constants/khepree';
import { getDevSigningKeys } from './dev-signing-keys';
import {
  KHEPREE_TRUSTED_SIGNING_KEYS_GENERATED,
  KHEPREE_TRUSTED_SIGNING_KEY_IDS,
} from './generated/trusted-signing-keys';

/** Pinned production endpoints — renderer cannot override these when packaged. */
export const KHEPREE_ENDPOINTS = {
  api: KHEPREE_PRODUCTION.apiBase,
  website: KHEPREE_EXTERNAL_URLS.website,
  account: KHEPREE_PRODUCTION.account,
} as const;

/** Desktop OAuth client registered on Khepree platform (Product Studio). */
export const KHEPREE_OAUTH_CLIENT_ID_DEFAULT = 'khepree.novel-ai.desktop' as const;

/**
 * Trusted Khepree Ed25519 public keys embedded at build time (keyId → SPKI base64).
 * Populated by scripts/generate-khepree-signing-keys.mjs from CI env — never commit private keys.
 */
export const KHEPREE_TRUSTED_SIGNING_KEYS: Readonly<Record<string, string>> =
  KHEPREE_TRUSTED_SIGNING_KEYS_GENERATED;

export { KHEPREE_TRUSTED_SIGNING_KEY_IDS };

export function getKhepreeApiBaseUrl(): string {
  if (app.isPackaged) {
    return KHEPREE_ENDPOINTS.api;
  }
  const override = process.env.KHEPREE_API_BASE?.trim();
  return override && override.length > 0 ? override : KHEPREE_ENDPOINTS.api;
}

export function getKhepreeAccountBaseUrl(): string {
  if (app.isPackaged) {
    return KHEPREE_ENDPOINTS.account;
  }
  const override = process.env.KHEPREE_ACCOUNT_BASE?.trim();
  return override && override.length > 0 ? override : KHEPREE_ENDPOINTS.account;
}

export function isKhepreeDevMockEnabled(): boolean {
  if (app.isPackaged) {
    return false;
  }
  return process.env.KHEPREE_DEV_MOCK === '1' || process.env.KHEPREE_DEV_MOCK === 'true';
}

export function getKhepreeProductId(): string {
  if (app.isPackaged) {
    return KHEPREE_PRODUCT_SLUG;
  }
  const override = process.env.KHEPREE_PRODUCT_ID?.trim();
  return override && override.length > 0 ? override : KHEPREE_PRODUCT_SLUG;
}

export function getKhepreeOAuthClientId(): string {
  if (app.isPackaged) {
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
  void input.installationId;
  void input.productId;
  const url = new URL(KHEPREE_ACCOUNT_AUTHORIZE_PATH, getKhepreeAccountBaseUrl());
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** Returns true when a trusted signing key is embedded in this build. */
export function hasKhepreeTrustedSigningKey(): boolean {
  return KHEPREE_TRUSTED_SIGNING_KEY_IDS.length > 0;
}

export function assertPackagedSigningKeyConfigured(): void {
  if (!app.isPackaged) {
    return;
  }
  if (!hasKhepreeTrustedSigningKey()) {
    throw new Error(
      'Packaged build is missing embedded Khepree license signing public keys. ' +
        'Set KHEPREE_LICENSE_SIGNING_PUBLIC_KEY at build time and run generate-khepree-signing-keys.',
    );
  }
  if (KHEPREE_TRUSTED_SIGNING_KEYS['dev-local']) {
    throw new Error('Packaged build must not embed dev-local signing keys.');
  }
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
