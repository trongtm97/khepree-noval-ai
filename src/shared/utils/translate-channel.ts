import type { AiProviderType } from '../constants/ai-provider';
import { formatMemoryUsage } from '../constants/pack-mode';

/**
 * Clear operator-facing channel label for AI panel / job progress.
 * VI copy is intentional product language (see task: Notebook vs Web API + local memory).
 */
export function formatTranslateChannel(input: {
  providerType?: string | null;
  packMode?: string | null;
}): string | null {
  const provider = formatProviderChannel(input.providerType);
  if (!provider) return null;
  // Primary channel statement for Notebook / Web API — memory usage is a separate line.
  if (input.providerType === 'PLAYWRIGHT_GEMINI' || input.providerType === 'GEMINI_WEB_API') {
    return provider;
  }
  const pack = formatPackMode(input.packMode);
  return pack ? `${provider} · ${pack}` : provider;
}

export { formatMemoryUsage };

function formatProviderChannel(type?: string | null): string | null {
  if (!type) return null;
  switch (type as AiProviderType) {
    case 'GEMINI_WEB_API':
      return 'Đang dùng Gemini Web API + bộ nhớ cục bộ';
    case 'PLAYWRIGHT_GEMINI':
      return 'Đang dùng Gemini Notebook';
    case 'GEMINI_OFFICIAL':
      return 'Đang dùng Gemini Official API';
    default:
      return type;
  }
}

function formatPackMode(mode?: string | null): string | null {
  if (mode === 'slim') return 'slim';
  if (mode === 'hybrid') return 'hybrid';
  if (mode === 'fat') return 'fat-pack';
  return null;
}
