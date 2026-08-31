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

export async function buildKhepreeDeviceProof(input: {
  sessionPublicId: string;
  method: string;
  path: string;
  body: string;
  sign: (message: Buffer) => Buffer;
}): Promise<KhepreeDeviceProof> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const bodySha256 = sha256Hex(input.body);
  const message = buildKhepreeDeviceProofMessage({
    sessionPublicId: input.sessionPublicId,
    timestamp,
    nonce,
    method: input.method,
    path: input.path,
    bodySha256,
  });
  const signature = input.sign(Buffer.from(message, 'utf8')).toString('base64');
  return {
    timestamp,
    nonce,
    signature,
    method: input.method.toUpperCase(),
    path: input.path,
    bodySha256,
  };
}
