import { app } from 'electron';
import { KHEPREE_PRODUCT_ID } from '@shared/constants/khepree';
import { getDevSigningKeys } from './dev-signing-keys';

/** Trusted Khepree Ed25519 public keys pinned at build time (keyId → SPKI base64). */
export const KHEPREE_TRUSTED_SIGNING_KEYS: Readonly<Record<string, string>> = {
  // Replace with production Khepree signing public key before release.
  k1: '',
};

export function getKhepreeApiBaseUrl(): string {
  return process.env.KHEPREE_API_BASE?.trim() ?? 'https://api.khepree.com/v1';
}

export function isKhepreeDevMockEnabled(): boolean {
  if (app?.isPackaged) {
    return false;
  }
  return process.env.KHEPREE_DEV_MOCK === '1' || process.env.KHEPREE_DEV_MOCK === 'true';
}

export function getKhepreeProductId(): string {
  return process.env.KHEPREE_PRODUCT_ID?.trim() ?? KHEPREE_PRODUCT_ID;
}

export function resolveTrustedSigningKey(keyId: string): string | null {
  const dev = getDevSigningKeys();
  if (dev?.keyId === keyId) {
    return dev.publicKeySpki;
  }
  const pinned = KHEPREE_TRUSTED_SIGNING_KEYS[keyId];
  return pinned && pinned.length > 0 ? pinned : null;
}
