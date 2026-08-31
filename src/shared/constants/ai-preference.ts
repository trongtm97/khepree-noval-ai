import { AI_PROVIDER_IDS } from './ai-provider';
import { TRANSLATION_AI_PROVIDER_IDS, type TranslationAiProviderId } from './translation-ai-providers';

/** User-facing translation AI choice — not internal transport IDs. */
export const AI_PREFERENCES = ['AUTO', 'GEMINI', 'CHATGPT', 'META_AI'] as const;

export type AiPreference = (typeof AI_PREFERENCES)[number];

/** Subset shown in provider health rows (excludes AUTO). */
export type AiProviderPreference = Exclude<AiPreference, 'AUTO'>;

export const AI_PROVIDER_PREFERENCES: AiProviderPreference[] = ['GEMINI', 'CHATGPT', 'META_AI'];

export const DEFAULT_AI_PREFERENCE: AiPreference = 'AUTO';

const GEMINI_PROVIDER_IDS: TranslationAiProviderId[] = [
  AI_PROVIDER_IDS.GEMINI_WEB_API,
  AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
];

export function isAiPreference(value: string): value is AiPreference {
  return (AI_PREFERENCES as readonly string[]).includes(value);
}

export function providerIdsForPreference(
  preference: AiProviderPreference,
): TranslationAiProviderId[] {
  switch (preference) {
    case 'GEMINI':
      return [...GEMINI_PROVIDER_IDS];
    case 'CHATGPT':
      return [AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT];
    case 'META_AI':
      return [AI_PROVIDER_IDS.PLAYWRIGHT_META_AI];
    default:
      return [];
  }
}

export function preferenceFromProviderId(providerId: string): AiProviderPreference | null {
  if (
    providerId === AI_PROVIDER_IDS.GEMINI_WEB_API ||
    providerId === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI
  ) {
    return 'GEMINI';
  }
  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT) return 'CHATGPT';
  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_META_AI) return 'META_AI';
  if ((TRANSLATION_AI_PROVIDER_IDS as readonly string[]).includes(providerId)) {
    return 'GEMINI';
  }
  return null;
}

export function pickBestProviderIdForPreference(
  preference: AiProviderPreference,
  readyProviderIds: Set<string>,
): TranslationAiProviderId | null {
  const candidates = providerIdsForPreference(preference);
  for (const id of candidates) {
    if (readyProviderIds.has(id)) return id;
  }
  return candidates[0] ?? null;
}

/** AUTO tries provider groups in this order when multiple are ready. */
export const AUTO_PREFERENCE_GROUP_ORDER: AiProviderPreference[] = [
  'GEMINI',
  'CHATGPT',
  'META_AI',
];
