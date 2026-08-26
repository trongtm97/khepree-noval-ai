/** AI provider backend types — do not hardcode a single Gemini path. */
export const AI_PROVIDER_TYPES = [
  'PLAYWRIGHT_GEMINI',
  'GEMINI_WEB_API',
  'GEMINI_OFFICIAL',
] as const;

export type AiProviderType = (typeof AI_PROVIDER_TYPES)[number];

export const AI_PROVIDER_STATUSES = [
  'READY',
  'LOGIN_REQUIRED',
  'ERROR',
  'DISABLED',
] as const;

export type AiProviderStatus = (typeof AI_PROVIDER_STATUSES)[number];

export const AI_ACCOUNT_STATUSES = [
  'READY',
  'LOGIN_REQUIRED',
  'ERROR',
  'DISABLED',
] as const;

export type AiAccountStatus = (typeof AI_ACCOUNT_STATUSES)[number];

/** Stable seeded provider IDs (migration 016). */
export const AI_PROVIDER_IDS = {
  PLAYWRIGHT_GEMINI: 'prov-playwright-gemini',
  GEMINI_WEB_API: 'prov-gemini-web-api',
  GEMINI_OFFICIAL: 'prov-gemini-official',
} as const;

export const AI_RESPONSE_STATUSES = [
  'SUCCESS',
  'ERROR',
  'LOGIN_REQUIRED',
  'SESSION_EXPIRED',
  'RATE_LIMIT',
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'UNKNOWN',
] as const;

export type AiResponseStatus = (typeof AI_RESPONSE_STATUSES)[number];

/** Statuses that may trigger fallback when fallback is enabled. */
export const DEFAULT_FALLBACK_STATUSES: readonly AiResponseStatus[] = [
  'RATE_LIMIT',
  'SERVICE_UNAVAILABLE',
  'LOGIN_REQUIRED',
  'SESSION_EXPIRED',
  // Playwright/Notebook path can fail (profile lock, UNKNOWN_UI) while Web API still works.
  'ERROR',
];

/** Always eligible for fallback even if app_meta overrides on_statuses narrowly. */
export const AUTH_FALLBACK_STATUSES: readonly AiResponseStatus[] = [
  'LOGIN_REQUIRED',
  'SESSION_EXPIRED',
];

export const AI_FALLBACK_META_KEYS = {
  enabled: 'ai.fallback.enabled',
  onStatuses: 'ai.fallback.on_statuses',
} as const;

export const GEMINI_WEBAPI_DEFAULT_PORT = 18765;

export const GEMINI_WEB_SESSION_SECRET_PREFIX = 'gemini_web_session:';

export function geminiWebSessionSecretKey(aiAccountId: string): string {
  return `${GEMINI_WEB_SESSION_SECRET_PREFIX}${aiAccountId}`;
}

/** Vietnamese user-facing messages for AI provider errors. */
export const AI_ERROR_MESSAGES_VI: Record<AiResponseStatus, string> = {
  SUCCESS: '',
  ERROR: 'Yêu cầu AI thất bại.',
  LOGIN_REQUIRED: 'Tài khoản Google cần đăng nhập lại.',
  SESSION_EXPIRED: 'Phiên Gemini đã hết hạn. Vui lòng kết nối lại.',
  RATE_LIMIT: 'Gemini đang giới hạn yêu cầu.',
  TIMEOUT: 'Hết thời gian chờ phản hồi từ Gemini.',
  NETWORK_ERROR: 'Không thể kết nối Gemini.',
  SERVICE_UNAVAILABLE: 'Dịch vụ Gemini tạm thời không khả dụng.',
  UNKNOWN: 'Lỗi AI không xác định.',
};
