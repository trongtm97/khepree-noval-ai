import { AI_PROVIDER_IDS } from './ai-provider';

/** Providers eligible as primary translation platform (chapter translate). */
export const TRANSLATION_AI_PROVIDER_IDS = [
  AI_PROVIDER_IDS.GEMINI_WEB_API,
  AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
  AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
  AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
] as const;

export type TranslationAiProviderId = (typeof TRANSLATION_AI_PROVIDER_IDS)[number];

export function isTranslationAiProviderId(id: string): id is TranslationAiProviderId {
  return (TRANSLATION_AI_PROVIDER_IDS as readonly string[]).includes(id);
}

/** Move primary provider to front; preserve relative order of the rest. */
export function reorderProvidersWithPrimary<T extends { providerId: string }>(
  providers: T[],
  primaryProviderId: string | null | undefined,
): T[] {
  if (!primaryProviderId) return providers;
  const idx = providers.findIndex((p) => p.providerId === primaryProviderId);
  if (idx <= 0) return providers;
  const copy = [...providers];
  const [primary] = copy.splice(idx, 1);
  copy.unshift(primary);
  return copy;
}
