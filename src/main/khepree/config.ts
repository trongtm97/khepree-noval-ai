import { app } from 'electron';
import {
  KHEPREE_ACCOUNT_AUTHORIZE_PATH,
  KHEPREE_EXTERNAL_URLS,
  KHEPREE_PRODUCT_SLUG,
  KHEPREE_PRODUCTION,
} from '@shared/constants/khepree';
import { computeSigningKeyId } from './platform-lease';
import { getDevSigningKeys } from './dev-signing-keys';

/** Pinned production endpoints — renderer cannot override these when packaged. */
export const KHEPREE_ENDPOINTS = {
  api: KHEPREE_PRODUCTION.apiBase,
  website: KHEPREE_EXTERNAL_URLS.website,
  account: KHEPREE_PRODUCTION.account,
} as const;

/** Desktop OAuth client registered on Khepree platform (Product Studio). */
export const KHEPREE_OAUTH_CLIENT_ID_DEFAULT = 'khepree.novel-ai.desktop' as const;

/** Trusted Khepree Ed25519 public keys pinned at build time (keyId → SPKI base64). */
export const KHEPREE_TRUSTED_SIGNING_KEYS: Readonly<Record<string, string>> = {
  // Set LICENSE_SIGNING_PUBLIC_KEY from production Khepree VPS at release build time.
};

export function getKhepreeApiBaseUrl(): string {
  if (app?.isPackaged) {
    return KHEPREE_ENDPOINTS.api;
  }
  const override = process.env.KHEPREE_API_BASE?.trim();
  return override && override.length > 0 ? override : KHEPREE_ENDPOINTS.api;
}

export function getKhepreeAccountBaseUrl(): string {
  if (app?.isPackaged) {
    return KHEPREE_ENDPOINTS.account;
  }
  const override = process.env.KHEPREE_ACCOUNT_BASE?.trim();
  return override && override.length > 0 ? override : KHEPREE_ENDPOINTS.account;
}

export function isKhepreeDevMockEnabled(): boolean {
  if (app?.isPackaged) {
    return false;
  }
  return process.env.KHEPREE_DEV_MOCK === '1' || process.env.KHEPREE_DEV_MOCK === 'true';
}

export function getKhepreeProductId(): string {
  if (app?.isPackaged) {
    return KHEPREE_PRODUCT_SLUG;
  }
  const override = process.env.KHEPREE_PRODUCT_ID?.trim();
  return override && override.length > 0 ? override : KHEPREE_PRODUCT_SLUG;
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

/** Returns true when a trusted signing key is available for packaged lease verification. */
export function hasKhepreeTrustedSigningKey(): boolean {
  if (Object.keys(KHEPREE_TRUSTED_SIGNING_KEYS).length > 0) {
    return true;
  }
  const envPublicKey = process.env.KHEPREE_LICENSE_SIGNING_PUBLIC_KEY?.trim();
  return Boolean(envPublicKey && envPublicKey.length > 0);
}

export function assertPackagedSigningKeyConfigured(): void {
  if (!app?.isPackaged) {
    return;
  }
  if (isKhepreeDevMockEnabled()) {
    return;
  }
  if (!hasKhepreeTrustedSigningKey()) {
    throw new Error(
      'KHEPREE_LICENSE_SIGNING_PUBLIC_KEY or KHEPREE_TRUSTED_SIGNING_KEYS must be set for packaged builds.',
    );
  }
}

export function resolveTrustedSigningKey(keyId: string): string | null {
  const pinned = KHEPREE_TRUSTED_SIGNING_KEYS[keyId];
  if (pinned && pinned.length > 0) {
    return pinned;
  }

  const envPublicKey = process.env.KHEPREE_LICENSE_SIGNING_PUBLIC_KEY?.trim();
  if (envPublicKey && envPublicKey.length > 0) {
    const envKeyId = computeSigningKeyId(envPublicKey);
    if (envKeyId === keyId) {
      return envPublicKey;
    }
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
