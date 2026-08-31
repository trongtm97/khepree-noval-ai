import { randomUUID } from 'node:crypto';

/** Canonical heartbeat device-proof payload — signed in main process only. */
export interface HeartbeatProofPayload {
  installationId: string;
  deviceId: string;
  timestamp: string;
  nonce: string;
}

export function canonicalHeartbeatProof(payload: HeartbeatProofPayload): Buffer {
  const ordered = {
    deviceId: payload.deviceId,
    installationId: payload.installationId,
    nonce: payload.nonce,
    timestamp: payload.timestamp,
  };
  return Buffer.from(JSON.stringify(ordered), 'utf8');
}

export function buildHeartbeatProofPayload(
  installationId: string,
  deviceId: string,
  now = Date.now(),
): HeartbeatProofPayload {
  return {
    installationId,
    deviceId,
    timestamp: new Date(now).toISOString(),
    nonce: randomUUID(),
  };
}
