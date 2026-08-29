import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import type { AiProviderDto } from '@shared/schemas/ai-provider';
import { detectTranslationMethod } from '../../../src/renderer/components/settings/ai-translation-method';

function provider(id: string, enabled: boolean): AiProviderDto {
  return {
    id,
    name: id,
    type: 'GEMINI_WEB_API',
    status: 'READY',
    priority: 1,
    enabled,
    fallbackAllowed: true,
    accountEmail: null,
    lastUsedAt: null,
    lastError: null,
    modelCount: 0,
  };
}

describe('detectTranslationMethod', () => {
  it('detects web api only', () => {
    const mode = detectTranslationMethod([
      provider(AI_PROVIDER_IDS.GEMINI_WEB_API, true),
      provider(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, false),
    ]);
    expect(mode).toBe('web_api');
  });

  it('detects playwright only', () => {
    const mode = detectTranslationMethod([
      provider(AI_PROVIDER_IDS.GEMINI_WEB_API, false),
      provider(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, true),
    ]);
    expect(mode).toBe('playwright');
  });

  it('detects auto when both enabled', () => {
    const mode = detectTranslationMethod([
      provider(AI_PROVIDER_IDS.GEMINI_WEB_API, true),
      provider(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, true),
    ]);
    expect(mode).toBe('auto');
  });
});
