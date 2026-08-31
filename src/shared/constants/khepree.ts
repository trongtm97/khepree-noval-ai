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
  products: 'https://khepree.com/products',
  account: 'https://account.khepree.com',
  devices: 'https://account.khepree.com/devices',
  plans: 'https://account.khepree.com/plans',
  checkout: 'https://account.khepree.com/checkout',
} as const;

export type KhepreeExternalLinkTarget = keyof typeof KHEPREE_EXTERNAL_URLS;

/** Authoritative access state machine — see khepree-access-states.ts */
export {
  KHEPREE_ACCESS_STATES,
  type KhepreeAccessStatus,
  KHEPREE_GATE_PHASES,
  type KhepreeGatePhase,
  isKhepreeActive,
  resolveStatusFromEntitlement,
  canUseKhepreeWorkspace,
  isBlockingWorkspaceStatus,
} from './khepree-access-states';

/** Heartbeat status from Khepree API. */
export const KHEPREE_HEARTBEAT_STATUSES = [
  'ACTIVE',
  'ENTITLEMENT_SUSPENDED',
  'ENTITLEMENT_EXPIRED',
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

/** Debounce system resume → immediate heartbeat (avoid duplicate ticks). */
export const KHEPREE_RESUME_HEARTBEAT_DEBOUNCE_MS = 30 * 1000;

/** OAuth loopback callback path. */
export const KHEPREE_OAUTH_CALLBACK_PATH = '/oauth/callback';

/** Custom protocol for browser OAuth return (URL-safe scheme — registered as "Khepree Novel AI"). */
export const KHEPREE_AUTH_PROTOCOL_SCHEME = 'khepree-novel-ai' as const;
export const KHEPREE_OAUTH_CALLBACK_HOST = 'auth' as const;
export const KHEPREE_OAUTH_CALLBACK_RELATIVE_PATH = '/callback' as const;
export const KHEPREE_OAUTH_REDIRECT_URI =
  `${KHEPREE_AUTH_PROTOCOL_SCHEME}://${KHEPREE_OAUTH_CALLBACK_HOST}${KHEPREE_OAUTH_CALLBACK_RELATIVE_PATH}` as const;

/** @deprecated Use KHEPREE_OAUTH_CALLBACK_RELATIVE_PATH with protocol handler. */
export const KHEPREE_LEGACY_OAUTH_LOOPBACK_PATH = KHEPREE_OAUTH_CALLBACK_PATH;

export const KHEPREE_LOGIN_PHASES = [
  'idle',
  'opening_browser',
  'waiting_sign_in',
  'exchanging',
  'success',
] as const;

export type KhepreeLoginPhase = (typeof KHEPREE_LOGIN_PHASES)[number];

/** Checkout status from Khepree billing API — not browser redirect. */
export const KHEPREE_CHECKOUT_STATUSES = [
  'PENDING',
  'PAID_ENTITLEMENT_PENDING',
  'ACCESS_ACTIVE',
  'FAILED',
  'CANCELLED',
] as const;

export type KhepreeCheckoutStatus = (typeof KHEPREE_CHECKOUT_STATUSES)[number];

/** Renderer-visible checkout UX phase (main process authoritative). */
export const KHEPREE_CHECKOUT_PHASES = [
  'idle',
  'waiting',
  'confirming',
  'failed',
  'cancelled',
  'timeout',
] as const;

export type KhepreeCheckoutPhase = (typeof KHEPREE_CHECKOUT_PHASES)[number];

/** Backoff poll delays (ms) — cap at last entry; never poll every second. */
export const KHEPREE_CHECKOUT_POLL_DELAYS_MS = [3_000, 5_000, 8_000, 13_000, 21_000, 34_000, 55_000, 60_000] as const;

/** Stop polling after this duration unless user keeps checking manually. */
export const KHEPREE_CHECKOUT_POLL_TIMEOUT_MS = 30 * 60 * 1000;
