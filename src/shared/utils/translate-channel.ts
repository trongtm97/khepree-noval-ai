import type { AiProviderType } from '../constants/ai-provider';

/** Human-readable channel for job progress / AI panel (EN labels; UI may localize). */
export function formatTranslateChannel(input: {
  providerType?: string | null;
  packMode?: string | null;
}): string | null {
  const provider = formatProviderShort(input.providerType);
  const pack = formatPackMode(input.packMode);
  if (!provider && !pack) return null;
  if (provider && pack) return `${provider} · ${pack}`;
  return provider ?? pack;
}

function formatProviderShort(type?: string | null): string | null {
  if (!type) return null;
  switch (type as AiProviderType) {
    case 'GEMINI_WEB_API':
      return 'Web API';
    case 'PLAYWRIGHT_GEMINI':
      return 'NotebookLM';
    case 'GEMINI_OFFICIAL':
      return 'Official API';
    default:
      return type;
  }
}

function formatPackMode(mode?: string | null): string | null {
  if (mode === 'slim') return 'slim';
  if (mode === 'fat') return 'fat-pack';
  return null;
}
