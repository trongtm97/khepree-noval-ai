import type { AiProviderType } from '../constants/ai-provider';
import { preferenceFromProviderId } from '../constants/ai-preference';

/** User-facing provider name for toolbar / job UI (no transport jargon). */
export function userFacingProviderLabel(
  providerType: string | null | undefined,
): string | null {
  if (!providerType) return null;
  switch (providerType as AiProviderType) {
    case 'GEMINI_WEB_API':
    case 'PLAYWRIGHT_GEMINI':
      return 'Gemini';
    case 'PLAYWRIGHT_CHATGPT':
      return 'ChatGPT';
    case 'PLAYWRIGHT_META_AI':
      return 'Meta AI';
    default:
      return null;
  }
}

export function userFacingProviderLabelFromId(providerId: string): string | null {
  const pref = preferenceFromProviderId(providerId);
  if (!pref) return null;
  switch (pref) {
    case 'GEMINI':
      return 'Gemini';
    case 'CHATGPT':
      return 'ChatGPT';
    case 'META_AI':
      return 'Meta AI';
  }
}
