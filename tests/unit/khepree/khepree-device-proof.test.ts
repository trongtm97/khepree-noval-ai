import { describe, expect, it } from 'vitest';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import {
  buildCanonicalDesktopPayloadSha256,
  buildKhepreeDeviceProofMessage,
  buildSignedDesktopRequestBody,
  sha256Hex,
} from '@main/khepree/khepree-device-proof';
import { KHEPREE_DESKTOP_PROOF_PATHS } from '@shared/constants/khepree';

function verifyWireBodyProof(input: {
  wireBody: string;
  sessionPublicId: string;
  proofPath: string;
  publicKeySpki: string;
  canonicalFields: Array<[string, string]>;
  nowSeconds?: number;
}): void {
  const parsed = JSON.parse(input.wireBody) as {
    sessionPublicId: string;
    deviceProof: {
      timestamp: number;
      nonce: string;
      signature: string;
      method: string;
      path: string;
      bodySha256: string;
    };
  };
  const bodySha256 = buildCanonicalDesktopPayloadSha256(
    input.sessionPublicId,
    input.canonicalFields,
  );
  expect(parsed.deviceProof.bodySha256).toBe(bodySha256);

  const message = buildKhepreeDeviceProofMessage({
    sessionPublicId: input.sessionPublicId,
    timestamp: parsed.deviceProof.timestamp,
    nonce: parsed.deviceProof.nonce,
    method: 'POST',
    path: input.proofPath,
    bodySha256,
  });
  const publicKey = createPublicKey({
    key: Buffer.from(input.publicKeySpki, 'base64'),
    format: 'der',
    type: 'spki',
  });
  const ok = verify(
    null,
    Buffer.from(message, 'utf8'),
    publicKey,
    Buffer.from(parsed.deviceProof.signature, 'base64'),
  );
  expect(ok).toBe(true);
  if (input.nowSeconds != null) {
    expect(Math.abs(input.nowSeconds - parsed.deviceProof.timestamp)).toBeLessThanOrEqual(120);
  }
}

describe('khepree-device-proof', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeySpki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const signFn = (message: Buffer) => sign(null, message, privateKey);

  it('builds refresh request body that passes server-style verification', () => {
    const nowSeconds = 1_700_000_000;
    const { wireBody } = buildSignedDesktopRequestBody({
      sessionPublicId: 'dss_test_session',
      method: 'POST',
      path: KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
      extraFields: [['refreshToken', 'refresh-secret-token']],
      sign: signFn,
      nowSeconds,
    });

    verifyWireBodyProof({
      wireBody,
      sessionPublicId: 'dss_test_session',
      proofPath: KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
      publicKeySpki,
      canonicalFields: [['refreshToken', 'refresh-secret-token']],
      nowSeconds,
    });
  });

  it('builds heartbeat request body that passes server-style verification', () => {
    const nowSeconds = 1_700_000_100;
    const { wireBody } = buildSignedDesktopRequestBody({
      sessionPublicId: 'dss_test_session',
      method: 'POST',
      path: KHEPREE_DESKTOP_PROOF_PATHS.heartbeat,
      extraFields: [['accessToken', 'access-secret-token']],
      sign: signFn,
      nowSeconds,
    });

    verifyWireBodyProof({
      wireBody,
      sessionPublicId: 'dss_test_session',
      proofPath: KHEPREE_DESKTOP_PROOF_PATHS.heartbeat,
      publicKeySpki,
      canonicalFields: [['accessToken', 'access-secret-token']],
      nowSeconds,
    });
  });

  it('rejects raw-body hash that includes deviceProof', () => {
    const nowSeconds = 1_700_000_200;
    const sessionPublicId = 'dss_test_session';
    const refreshToken = 'refresh-secret-token';
    const partialBody = JSON.stringify({ sessionPublicId, refreshToken });
    const partialHash = sha256Hex(partialBody);

    const message = buildKhepreeDeviceProofMessage({
      sessionPublicId,
      timestamp: nowSeconds,
      nonce: 'nonce-old-client',
      method: 'POST',
      path: KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
      bodySha256: partialHash,
    });
    const signature = sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');

    const wireBody = JSON.stringify({
      sessionPublicId,
      refreshToken,
      deviceProof: {
        bodySha256: partialHash,
        method: 'POST',
        nonce: 'nonce-old-client',
        path: KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
        signature,
        timestamp: nowSeconds,
      },
    });

    const serverBodySha256 = sha256Hex(wireBody);
    expect(serverBodySha256).not.toBe(partialHash);

    const serverMessage = buildKhepreeDeviceProofMessage({
      sessionPublicId,
      timestamp: nowSeconds,
      nonce: 'nonce-old-client',
      method: 'POST',
      path: KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
      bodySha256: serverBodySha256,
    });
    const ok = verify(
      null,
      Buffer.from(serverMessage, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64'),
    );
    expect(ok).toBe(false);
  });

  it('accepts PKCS8-backed sign function from stored device key', () => {
    const { privateKey: storedPrivateKey, publicKey: storedPublicKey } =
      generateKeyPairSync('ed25519');
    const pkcs8Base64 = storedPrivateKey
      .export({ format: 'der', type: 'pkcs8' })
      .toString('base64');
    const storedPublicKeySpki = storedPublicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64');
    const keyObject = createPrivateKey({
      key: Buffer.from(pkcs8Base64, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    const storedSign = (message: Buffer) => sign(null, message, keyObject);

    const { wireBody } = buildSignedDesktopRequestBody({
      sessionPublicId: 'dss_pkcs8',
      method: 'POST',
      path: KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
      extraFields: [['refreshToken', 'refresh-pkcs8']],
      sign: storedSign,
      nowSeconds: 1_700_000_300,
    });

    verifyWireBodyProof({
      wireBody,
      sessionPublicId: 'dss_pkcs8',
      proofPath: KHEPREE_DESKTOP_PROOF_PATHS.authRefresh,
      publicKeySpki: storedPublicKeySpki,
      canonicalFields: [['refreshToken', 'refresh-pkcs8']],
      nowSeconds: 1_700_000_300,
    });
  });
});
