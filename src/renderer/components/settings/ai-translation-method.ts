import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import type { AiProviderDto } from '@shared/schemas/ai-provider';

export type AiTranslationMethod = 'web_api' | 'playwright' | 'auto';

export function detectTranslationMethod(
  providers: AiProviderDto[],
): AiTranslationMethod {
  const web = providers.find((p) => p.id === AI_PROVIDER_IDS.GEMINI_WEB_API);
  const browser = providers.find((p) => p.id === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI);

  if (web?.enabled && browser?.enabled) return 'auto';
  if (web?.enabled && !browser?.enabled) return 'web_api';
  if (browser?.enabled && !web?.enabled) return 'playwright';
  if (web?.enabled) return 'web_api';
  if (browser?.enabled) return 'playwright';
  return 'auto';
}

export async function applyTranslationMethod(mode: AiTranslationMethod): Promise<void> {
  const api = window.khepreeNovelAI.aiProviders;
  const { GEMINI_WEB_API, PLAYWRIGHT_GEMINI, GEMINI_OFFICIAL } = AI_PROVIDER_IDS;

  await api.setEnabled({ providerId: GEMINI_OFFICIAL, enabled: false });

  if (mode === 'web_api') {
    await api.setEnabled({ providerId: GEMINI_WEB_API, enabled: true });
    await api.setEnabled({ providerId: PLAYWRIGHT_GEMINI, enabled: false });
    await api.setPriority({ providerId: GEMINI_WEB_API, priority: 1 });
    await api.setFallback({ enabled: false });
    return;
  }

  if (mode === 'playwright') {
    await api.setEnabled({ providerId: GEMINI_WEB_API, enabled: false });
    await api.setEnabled({ providerId: PLAYWRIGHT_GEMINI, enabled: true });
    await api.setPriority({ providerId: PLAYWRIGHT_GEMINI, priority: 1 });
    await api.setFallback({ enabled: false });
    return;
  }

  await api.setEnabled({ providerId: GEMINI_WEB_API, enabled: true });
  await api.setEnabled({ providerId: PLAYWRIGHT_GEMINI, enabled: true });
  await api.setPriority({ providerId: GEMINI_WEB_API, priority: 1 });
  await api.setPriority({ providerId: PLAYWRIGHT_GEMINI, priority: 2 });
  await api.setFallback({ enabled: true });
}

export function providerForMethod(mode: AiTranslationMethod): string {
  if (mode === 'web_api') return AI_PROVIDER_IDS.GEMINI_WEB_API;
  if (mode === 'playwright') return AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI;
  return AI_PROVIDER_IDS.GEMINI_WEB_API;
}
