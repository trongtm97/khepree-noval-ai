/** Account-aware AI provider preflight results (scheduler / routing). */
export const PROVIDER_PREFLIGHT_RESULTS = [
  'READY',
  'DEGRADED',
  'NEEDS_LOGIN',
  'PROFILE_BUSY',
  'NOTEBOOK_ERROR',
  'QUOTA_LIMIT',
  'UNAVAILABLE',
] as const;

export type ProviderPreflightResult = (typeof PROVIDER_PREFLIGHT_RESULTS)[number];

/** AUTO = pick READY by priority (fallback allowed). PIN = stick to preferred provider. */
export const AI_ROUTING_MODES = ['AUTO', 'PIN'] as const;
export type AiRoutingMode = (typeof AI_ROUTING_MODES)[number];

export const AI_ROUTING_META_KEYS = {
  mode: 'ai.routing.mode',
  /** Optional pinned provider id when mode=PIN (else priority #1). */
  pinnedProviderId: 'ai.routing.pinned_provider_id',
  /** Global default primary translation provider. */
  primaryProviderId: 'ai.routing.primary_provider_id',
  /** User-facing AI preference (AUTO | GEMINI | CHATGPT | META_AI). */
  preference: 'ai.routing.preference',
} as const;

export function isProviderPreflightUsable(result: ProviderPreflightResult): boolean {
  return result === 'READY' || result === 'DEGRADED';
}
