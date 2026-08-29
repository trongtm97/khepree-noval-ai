import { describe, expect, it } from 'vitest';
import { AiProviderManager } from '@main/ai/ai-provider-manager';
import type { IAIProvider } from '@main/ai/iai-provider';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { AI_ROUTING_META_KEYS } from '@shared/constants/provider-preflight';

function mockProvider(id: string, type: IAIProvider['providerType']): IAIProvider {
  return {
    providerId: id,
    providerType: type,
    initialize: async () => undefined,
    healthCheck: async () => ({ ok: true, status: 'READY' as const, message: 'ok' }),
    sendPrompt: async () => ({
      requestId: '1',
      status: 'SUCCESS' as const,
      text: 'ok',
    }),
    cancelRequest: async () => undefined,
    getStatus: async () => ({
      providerId: id,
      type,
      ready: true,
      message: 'ok',
    }),
    close: async () => undefined,
  };
}

describe('AiProviderManager primary ordering', () => {
  it('puts configured primary provider first regardless of DB priority', () => {
    const meta = new Map<string, string>([
      [AI_ROUTING_META_KEYS.primaryProviderId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT],
    ]);

    const db = {
      aiProviders: {
        listEnabledOrdered: () => [
          {
            id: AI_PROVIDER_IDS.GEMINI_WEB_API,
            priority: 1,
            enabled: 1,
          },
          {
            id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
            priority: 2,
            enabled: 1,
          },
          {
            id: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
            priority: 3,
            enabled: 1,
          },
        ],
        getById: (id: string) => ({ id, priority: 1, enabled: 1 }),
      },
      appMeta: {
        get: (key: string) => meta.get(key) ?? null,
        set: (key: string, value: string) => {
          meta.set(key, value);
        },
      },
      projects: {
        getStyleConfig: () => null,
      },
      notebooks: {
        listByProjectAndWorker: () => [],
      },
    } as unknown as ConstructorParameters<typeof AiProviderManager>[0];

    const manager = new AiProviderManager(db);
    manager.register(mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API'));
    manager.register(
      mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, 'PLAYWRIGHT_GEMINI'),
    );
    manager.register(
      mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'PLAYWRIGHT_CHATGPT'),
    );

    const ordered = manager.selectOrderedProviders();
    expect(ordered.map((p) => p.providerId)).toEqual([
      AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      AI_PROVIDER_IDS.GEMINI_WEB_API,
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
    ]);
  });
});
