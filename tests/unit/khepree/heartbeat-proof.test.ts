import { describe, expect, it } from 'vitest';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import {
  buildHeartbeatProofPayload,
  canonicalHeartbeatProof,
} from '@main/khepree/heartbeat-proof';
import { getDevSigningKeys } from '@main/khepree/dev-signing-keys';

process.env.KHEPREE_DEV_MOCK = '1';

describe('heartbeat-proof', () => {
  it('builds canonical payload with stable key order', () => {
    const payload = buildHeartbeatProofPayload(
      '11111111-1111-4111-8111-111111111111',
      'device-1',
      Date.parse('2026-01-01T00:00:00.000Z'),
    );
    const canonical = canonicalHeartbeatProof(payload).toString('utf8');
    expect(canonical).toContain('"deviceId":"device-1"');
    expect(canonical.indexOf('"deviceId"')).toBeLessThan(canonical.indexOf('"installationId"'));
    expect(canonical.indexOf('"nonce"')).toBeLessThan(canonical.indexOf('"timestamp"'));
  });

  it('Ed25519 device key signs canonical heartbeat proof', () => {
    const dev = getDevSigningKeys();
    if (!dev) throw new Error('dev keys missing');
    const privateKey = createPrivateKey({
      key: Buffer.from(dev.privateKeyPkcs8, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    const publicKey = createPublicKey(privateKey);
    const payload = buildHeartbeatProofPayload(
      '11111111-1111-4111-8111-111111111111',
      'device-1',
    );
    const message = canonicalHeartbeatProof(payload);
    const signature = sign(null, message, privateKey);
    expect(verify(null, message, publicKey, signature)).toBe(true);
  });
});
