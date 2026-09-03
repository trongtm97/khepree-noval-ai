/** Khepree commercial licensing — shared constants. */

/** Stable internal product code (Product Studio metadata). */
export const KHEPREE_PRODUCT_CODE = 'KHEPREE_NOVEL_AI' as const;

/** Public catalog slug — used for lease productSlug binding and account URLs. */
export const KHEPREE_PRODUCT_SLUG = 'khepree-novel-ai' as const;

/** @deprecated Use KHEPREE_PRODUCT_SLUG */
export const KHEPREE_PRODUCT_ID = KHEPREE_PRODUCT_SLUG;

/** Primary entitlement feature — never branch on plan name strings. */
export const KHEPREE_ACCESS_FEATURE = 'novel_ai.access' as const;

/** Pinned production origins — match KHEPREE deploy (.env.production). */
export const KHEPREE_PRODUCTION = {
  website: 'https://khepree.com',
  account: 'https://account.khepree.com',
  apiOrigin: 'https://api.khepree.com',
  /** Desktop API base — routes live under /api/v1/desktop/* */
  apiBase: 'https://api.khepree.com/api/v1',
} as const;

/** Desktop OAuth authorize path on account.khepree.com */
export const KHEPREE_ACCOUNT_AUTHORIZE_PATH = '/desktop/authorize' as const;

/** Khepree platform desktop API paths (append to KHEPREE_PRODUCTION.apiBase). */
export const KHEPREE_DESKTOP_API_PATHS = {
  authExchange: '/desktop/auth/exchange',
  authRefresh: '/desktop/auth/refresh',
  authLogout: '/desktop/auth/logout',
  activate: '/desktop/activate',
  me: '/desktop/me',
  heartbeat: '/desktop/heartbeat',
  checkout: '/desktop/checkout',
  plans: '/desktop/plans',
  announcements: '/desktop/announcements',
  updatesLatest: '/desktop/updates/latest',
  updatesSquirrelFeedTicket: '/desktop/updates/squirrel-feed-ticket',
  /** Opt-in campaign status sync — default OFF. See campaign-sync-service.ts */
  campaignSync: '/desktop/campaign-sync',
} as const;

/** Announcement sync interval when online (ms). */
export const KHEPREE_ANNOUNCEMENT_SYNC_INTERVAL_MS = 20 * 60 * 1000;

/** Max cached announcements retained locally. */
export const KHEPREE_ANNOUNCEMENT_CACHE_MAX = 100;

/** Full device-proof paths (include /api/v1 prefix). */
export const KHEPREE_DESKTOP_PROOF_PATHS = {
  authRefresh: '/api/v1/desktop/auth/refresh',
  heartbeat: '/api/v1/desktop/heartbeat',
} as const;

export const KHEPREE_META_KEYS = {
  installationId: 'khepree.device.installation_id',
  deviceId: 'khepree.device.device_id',
  deviceName: 'khepree.device.name',
  sessionPublicId: 'khepree.session.public_id',
} as const;

export const KHEPREE_SECRET_KEYS = {
  refreshToken: 'khepree.session.refresh_token',
  devicePrivateKey: 'khepree.device.private_key',
} as const;

/** Production allowlist — renderer cannot open arbitrary URLs. */
export const KHEPREE_EXTERNAL_URLS = {
  website: KHEPREE_PRODUCTION.website,
  products: `${KHEPREE_PRODUCTION.website}/products`,
  account: KHEPREE_PRODUCTION.account,
  devices: `${KHEPREE_PRODUCTION.account}/devices`,
  plans: `${KHEPREE_PRODUCTION.account}/billing`,
  checkout: `${KHEPREE_PRODUCTION.account}/checkout`,
  productHub: `${KHEPREE_PRODUCTION.account}/products/khepree-novel-ai`,
} as const;

export type KhepreeExternalLinkTarget = keyof typeof KHEPREE_EXTERNAL_URLS;

/** Authoritative access state machine — see khepree-access-states.ts */
export {
  KHEPREE_ACCESS_STATES,
  type KhepreeAccessStatus,
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
  /** Phase 20: opt-in campaign status sync. Default false when absent from lease. */
  campaignStatusSync: 'campaign_status_sync_enabled',
} as const;

export type KhepreeFeatureKey = (typeof KHEPREE_FEATURES)[keyof typeof KHEPREE_FEATURES];

/** Default heartbeat interval (ms) — server may override via lease. */
export const KHEPREE_DEFAULT_HEARTBEAT_MS = 15 * 60 * 1000;

/** Debounce system resume → immediate heartbeat (avoid duplicate ticks). */
export const KHEPREE_RESUME_HEARTBEAT_DEBOUNCE_MS = 30 * 1000;

/** OAuth loopback callback path. */
export const KHEPREE_OAUTH_CALLBACK_PATH = '/oauth/callback';

/** Custom protocol for browser OAuth return (URL-safe scheme — registered as "Khepree Novel AI"). */
export const KHEPREE_AUTH_PROTOCOL_SCHEME = 'khepreenovelai' as const;
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
