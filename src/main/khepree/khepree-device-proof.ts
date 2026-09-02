import { createHash, randomUUID } from 'node:crypto';

/** Khepree platform desktop device proof (refresh / heartbeat). */
export interface KhepreeDeviceProof {
  timestamp: number;
  nonce: string;
  signature: string;
  method: string;
  path: string;
  bodySha256: string;
}

export interface SignedDesktopRequest {
  wireBody: string;
  deviceProof: KhepreeDeviceProof;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildKhepreeDeviceProofMessage(input: {
  sessionPublicId: string;
  timestamp: number;
  nonce: string;
  method: string;
  path: string;
  bodySha256: string;
}): string {
  return [
    'KHEPREE-DESKTOP-V1',
    input.sessionPublicId,
    String(input.timestamp),
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    input.bodySha256,
  ].join('\n');
}

/** Canonical signed payload — excludes deviceProof (matches Khepree API verification). */
export function buildCanonicalDesktopPayloadSha256(
  sessionPublicId: string,
  extraFields: Array<[string, string]>,
): string {
  const payload: Record<string, string> = { sessionPublicId };
  for (const [key, value] of extraFields) {
    payload[key] = value;
  }
  return sha256Hex(JSON.stringify(payload));
}

function serializeSignedRequestBody(
  sessionPublicId: string,
  extraFields: Array<[string, string]>,
  proof: KhepreeDeviceProof,
): string {
  const body: Record<string, unknown> = { sessionPublicId };
  for (const [key, value] of extraFields) {
    body[key] = value;
  }
  body.deviceProof = {
    bodySha256: proof.bodySha256,
    method: proof.method,
    nonce: proof.nonce,
    path: proof.path,
    signature: proof.signature,
    timestamp: proof.timestamp,
  };
  return JSON.stringify(body);
}

/**
 * Build a signed desktop API request body. Device proof hashes the canonical JSON
 * payload (session fields only, excluding deviceProof) — same rule as Khepree API.
 */
export function buildSignedDesktopRequestBody(input: {
  sessionPublicId: string;
  method: string;
  path: string;
  extraFields: Array<[string, string]>;
  sign: (message: Buffer) => Buffer;
  nowSeconds?: number;
}): SignedDesktopRequest {
  const timestamp = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const method = input.method.toUpperCase();
  const bodySha256 = buildCanonicalDesktopPayloadSha256(
    input.sessionPublicId,
    input.extraFields,
  );

  const message = buildKhepreeDeviceProofMessage({
    sessionPublicId: input.sessionPublicId,
    timestamp,
    nonce,
    method,
    path: input.path,
    bodySha256,
  });
  const signature = input.sign(Buffer.from(message, 'utf8')).toString('base64');

  const deviceProof: KhepreeDeviceProof = {
    timestamp,
    nonce,
    signature,
    method,
    path: input.path,
    bodySha256,
  };

  return {
    wireBody: serializeSignedRequestBody(
      input.sessionPublicId,
      input.extraFields,
      deviceProof,
    ),
    deviceProof,
  };
}
