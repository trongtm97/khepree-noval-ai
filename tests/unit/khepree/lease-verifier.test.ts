import { describe, expect, it, beforeAll } from 'vitest';
import { createPrivateKey, sign } from 'node:crypto';
import { getDevSigningKeys } from '@main/khepree/dev-signing-keys';
import { verifySignedLease, isLeaseCurrentlyValid } from '@main/khepree/lease-verifier';
import type { KhepreeSignedLeasePayload } from '@shared/schemas/khepree';

process.env.KHEPREE_DEV_MOCK = '1';

function signPayload(payload: KhepreeSignedLeasePayload) {
  const dev = getDevSigningKeys();
  if (!dev) throw new Error('dev keys missing');
  const privateKey = createPrivateKey({
    key: Buffer.from(dev.privateKeyPkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
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
  const message = Buffer.from(JSON.stringify(ordered), 'utf8');
  const signature = sign(null, message, privateKey).toString('base64url');
  return { payload, keyId: dev.keyId, signature };
}

describe('lease-verifier', () => {
  beforeAll(() => {
    process.env.KHEPREE_DEV_MOCK = '1';
  });

  it('accepts valid dev-signed lease', () => {
    const payload: KhepreeSignedLeasePayload = {
      installationId: '11111111-1111-4111-8111-111111111111',
      deviceId: 'dev-device',
      productId: 'novel-ai',
      features: { translation: true },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      graceUntil: null,
    };
    const lease = signPayload(payload);
    const verified = verifySignedLease(lease);
    expect(verified.deviceId).toBe('dev-device');
    expect(isLeaseCurrentlyValid(lease)).toBe(true);
  });

  it('rejects tampered signature', () => {
    const payload: KhepreeSignedLeasePayload = {
      installationId: '11111111-1111-4111-8111-111111111111',
      deviceId: 'dev-device',
      productId: 'novel-ai',
      features: { translation: true },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      graceUntil: null,
    };
    const lease = signPayload(payload);
    lease.signature = 'AAAA';
    expect(() => verifySignedLease(lease)).toThrow();
  });
});
