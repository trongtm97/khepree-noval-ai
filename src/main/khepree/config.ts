import { app } from 'electron';
import { KHEPREE_EXTERNAL_URLS, KHEPREE_PRODUCT_ID } from '@shared/constants/khepree';
import { getDevSigningKeys } from './dev-signing-keys';

/** Pinned production endpoints — renderer cannot override these. */
export const KHEPREE_ENDPOINTS = {
  api: 'https://api.khepree.com/v1',
  website: KHEPREE_EXTERNAL_URLS.website,
  account: KHEPREE_EXTERNAL_URLS.account,
} as const;

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

export function resolveTrustedSigningKey(keyId: string): string | null {
  const dev = getDevSigningKeys();
  if (dev?.keyId === keyId) {
    return dev.publicKeySpki;
  }
  const pinned = KHEPREE_TRUSTED_SIGNING_KEYS[keyId];
  return pinned && pinned.length > 0 ? pinned : null;
}
