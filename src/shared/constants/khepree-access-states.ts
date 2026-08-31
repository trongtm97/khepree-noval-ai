/** Authoritative Khepree access state machine — single source of truth. */
export const KHEPREE_ACCESS_STATES = [
  'BOOTING',
  'LANGUAGE_REQUIRED',
  'AUTH_REQUIRED',
  'AUTHENTICATING',
  'VALIDATING_SESSION',
  'ENTITLEMENT_MISSING',
  'ENTITLEMENT_EXPIRED',
  'ENTITLEMENT_SUSPENDED',
  'DEVICE_ACTIVATING',
  'DEVICE_LIMIT_REACHED',
  'DEVICE_REMOVED',
  'DEVICE_BLOCKED',
  'OFFLINE_COLD_START',
  'ACTIVE',
  'ERROR',
] as const;

export type KhepreeAccessStatus = (typeof KHEPREE_ACCESS_STATES)[number];

/** @deprecated Legacy gate phases — use KHEPREE_ACCESS_STATES / status field. */
export const KHEPREE_GATE_PHASES = [
  'login',
  'validating',
  'offline',
  'entitlement',
  'device_limit',
  'revoked',
  'workspace',
] as const;

export type KhepreeGatePhase = (typeof KHEPREE_GATE_PHASES)[number];

export function isKhepreeActive(status: KhepreeAccessStatus): boolean {
  return status === 'ACTIVE';
}

export function canUseKhepreeWorkspace(status: KhepreeAccessStatus, leaseValid: boolean): boolean {
  return status === 'ACTIVE' && leaseValid;
}

export function resolveStatusFromEntitlement(
  entitlement: 'none' | 'active' | 'suspended' | 'expired',
): KhepreeAccessStatus {
  switch (entitlement) {
    case 'none':
      return 'ENTITLEMENT_MISSING';
    case 'expired':
      return 'ENTITLEMENT_EXPIRED';
    case 'suspended':
      return 'ENTITLEMENT_SUSPENDED';
    case 'active':
      return 'ACTIVE';
    default:
      return 'ENTITLEMENT_MISSING';
  }
}

export function isBlockingWorkspaceStatus(status: KhepreeAccessStatus): boolean {
  return !isKhepreeActive(status);
}
