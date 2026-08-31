import { createPublicKey, verify } from 'node:crypto';
import {
  KhepreeSignedLeaseSchema,
  type KhepreeSignedLease,
  type KhepreeSignedLeasePayload,
} from '@shared/schemas/khepree';
import { resolveTrustedSigningKey } from './config';
import { KhepreeLeaseInvalidError } from './errors';

function canonicalPayload(payload: KhepreeSignedLeasePayload): Buffer {
  const ordered = {
    deviceId: payload.deviceId,
    expiresAt: payload.expiresAt,
    features: Object.keys(payload.features)
      .sort()
      .reduce<Record<string, boolean>>((acc, key) => {
        acc[key] = payload.features[key] ?? false;
        return acc;
      }, {}),
    graceUntil: payload.graceUntil,
    heartbeatIntervalMs: payload.heartbeatIntervalMs,
    installationId: payload.installationId,
    productId: payload.productId,
  };
  return Buffer.from(JSON.stringify(ordered), 'utf8');
}

export function parseSignedLease(raw: unknown): KhepreeSignedLease {
  const parsed = KhepreeSignedLeaseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new KhepreeLeaseInvalidError('Lease payload schema invalid.');
  }
  return parsed.data;
}

export function verifySignedLease(lease: KhepreeSignedLease, now = Date.now()): KhepreeSignedLeasePayload {
  const publicKeySpki = resolveTrustedSigningKey(lease.keyId);
  if (!publicKeySpki) {
    throw new KhepreeLeaseInvalidError(`Unknown signing keyId: ${lease.keyId}`);
  }

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(publicKeySpki, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    throw new KhepreeLeaseInvalidError('Trusted signing public key is misconfigured.');
  }

  const message = canonicalPayload(lease.payload);
  const signature = Buffer.from(lease.signature, 'base64url');

  const ok = verify(null, message, publicKey, signature);
  if (!ok) {
    throw new KhepreeLeaseInvalidError('Lease Ed25519 signature verification failed.');
  }

  const expiresAt = Date.parse(lease.payload.expiresAt);
  if (Number.isNaN(expiresAt)) {
    throw new KhepreeLeaseInvalidError('Lease expiresAt is invalid.');
  }

  const graceUntil = lease.payload.graceUntil ? Date.parse(lease.payload.graceUntil) : null;
  const withinGrace = graceUntil != null && !Number.isNaN(graceUntil) && now <= graceUntil;

  if (now > expiresAt && !withinGrace) {
    throw new KhepreeLeaseInvalidError('Lease has expired.');
  }

  return lease.payload;
}

export function isLeaseCurrentlyValid(
  lease: KhepreeSignedLease | null,
  now = Date.now(),
): lease is KhepreeSignedLease {
  if (!lease) return false;
  try {
    verifySignedLease(lease, now);
    return true;
  } catch {
    return false;
  }
}
