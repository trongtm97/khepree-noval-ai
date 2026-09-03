/**
 * Shared Khepree license signing public-key helpers (build + release gate).
 * PUBLIC keys only — never handle private key material here.
 */
import { createHash, createPublicKey } from 'node:crypto';

const DEV_KEY_IDS = new Set(['dev-local']);

export function computeSigningKeyId(publicKeySpkiBase64) {
  return createHash('sha256').update(publicKeySpkiBase64, 'utf8').digest('hex').slice(0, 16);
}

export function isLikelyBase64Spki(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 32) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed);
}

/** Validate SPKI base64 parses as an asymmetric public key (Ed25519 expected in production). */
export function validatePublicKeySpkiBase64(publicKeySpkiBase64, label = 'public key') {
  const trimmed = publicKeySpkiBase64.trim();
  if (!isLikelyBase64Spki(trimmed)) {
    throw new Error(`${label}: invalid base64 SPKI format.`);
  }
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(trimmed, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    throw new Error(`${label}: SPKI DER could not be parsed.`);
  }
  const type = publicKey.asymmetricKeyType;
  if (type !== 'ed25519') {
    throw new Error(`${label}: expected Ed25519 SPKI, got ${type ?? 'unknown'}.`);
  }
  return trimmed;
}

export function assertProductionKeyId(keyId) {
  if (DEV_KEY_IDS.has(keyId)) {
    throw new Error(`Dev signing keyId "${keyId}" must not be embedded in production builds.`);
  }
}

export function collectSigningKeysFromEnv() {
  /** @type {Record<string, string>} */
  const map = {};

  const jsonRaw = process.env.KHEPREE_TRUSTED_SIGNING_KEYS_JSON?.trim();
  if (jsonRaw) {
    let parsed;
    try {
      parsed = JSON.parse(jsonRaw);
    } catch {
      throw new Error('KHEPREE_TRUSTED_SIGNING_KEYS_JSON is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('KHEPREE_TRUSTED_SIGNING_KEYS_JSON must be a JSON object.');
    }
    for (const [keyId, spki] of Object.entries(parsed)) {
      if (typeof keyId !== 'string' || typeof spki !== 'string') {
        throw new Error('KHEPREE_TRUSTED_SIGNING_KEYS_JSON entries must be string keyId → SPKI.');
      }
      const normalized = validatePublicKeySpkiBase64(spki, `keyId ${keyId}`);
      const derivedId = computeSigningKeyId(normalized);
      if (derivedId !== keyId) {
        throw new Error(
          `keyId ${keyId} does not match SPKI fingerprint (expected ${derivedId}).`,
        );
      }
      assertProductionKeyId(keyId);
      map[keyId] = normalized;
    }
  }

  const primary = process.env.KHEPREE_LICENSE_SIGNING_PUBLIC_KEY?.trim();
  if (primary) {
    const normalized = validatePublicKeySpkiBase64(primary, 'KHEPREE_LICENSE_SIGNING_PUBLIC_KEY');
    const keyId = computeSigningKeyId(normalized);
    assertProductionKeyId(keyId);
    map[keyId] = normalized;
  }

  const legacy = process.env.KHEPREE_LICENSE_SIGNING_PUBLIC_KEY_LEGACY?.trim();
  if (legacy) {
    const normalized = validatePublicKeySpkiBase64(
      legacy,
      'KHEPREE_LICENSE_SIGNING_PUBLIC_KEY_LEGACY',
    );
    const keyId = computeSigningKeyId(normalized);
    assertProductionKeyId(keyId);
    map[keyId] = normalized;
  }

  return map;
}

export function formatKeyIdsForLog(keyIds) {
  return keyIds.length === 0 ? '(none)' : keyIds.join(', ');
}
