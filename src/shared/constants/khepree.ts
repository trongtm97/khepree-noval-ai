/** Khepree commercial licensing — shared constants. */

export const KHEPREE_PRODUCT_ID = 'novel-ai' as const;

export const KHEPREE_META_KEYS = {
  installationId: 'khepree.device.installation_id',
  deviceId: 'khepree.device.device_id',
  deviceName: 'khepree.device.name',
} as const;

export const KHEPREE_SECRET_KEYS = {
  refreshToken: 'khepree.session.refresh_token',
  devicePrivateKey: 'khepree.device.private_key',
} as const;

/** Production allowlist — renderer cannot open arbitrary URLs. */
export const KHEPREE_EXTERNAL_URLS = {
  website: 'https://khepree.com',
  account: 'https://account.khepree.com',
  devices: 'https://account.khepree.com/devices',
  plans: 'https://account.khepree.com/plans',
  checkout: 'https://account.khepree.com/checkout',
} as const;

export type KhepreeExternalLinkTarget = keyof typeof KHEPREE_EXTERNAL_URLS;

/** Gate the renderer must pass before functional workspace. */
export const KHEPREE_GATE_PHASES = [
  'login',
  'offline',
  'entitlement',
  'device_limit',
  'revoked',
  'workspace',
] as const;

export type KhepreeGatePhase = (typeof KHEPREE_GATE_PHASES)[number];

/** Heartbeat status from Khepree API. */
export const KHEPREE_HEARTBEAT_STATUSES = [
  'ACTIVE',
  'ENTITLEMENT_SUSPENDED',
  'DEVICE_REMOVED',
  'DEVICE_BLOCKED',
  'SESSION_REVOKED',
  'NETWORK_TEMPORARY',
] as const;

export type KhepreeHeartbeatStatus = (typeof KHEPREE_HEARTBEAT_STATUSES)[number];

/** Feature keys — never branch on plan name strings. */
export const KHEPREE_FEATURES = {
  translation: 'translation',
  export: 'export',
  multiProvider: 'multi_provider',
  learning: 'learning',
} as const;

export type KhepreeFeatureKey = (typeof KHEPREE_FEATURES)[keyof typeof KHEPREE_FEATURES];

/** Default heartbeat interval (ms) — server may override via lease. */
export const KHEPREE_DEFAULT_HEARTBEAT_MS = 15 * 60 * 1000;

/** OAuth loopback callback path. */
export const KHEPREE_OAUTH_CALLBACK_PATH = '/oauth/callback';
