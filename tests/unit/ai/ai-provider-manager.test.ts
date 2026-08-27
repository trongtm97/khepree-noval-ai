import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AiProviderManager } from '@main/ai/ai-provider-manager';
import type { IAIProvider } from '@main/ai/iai-provider';
import type { AIResponse } from '@main/ai/types';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { newId } from '@main/db/utils/uuid';

function minimalPack(): TranslationPackDto {
  return {
    projectId: newId(),
    chapterIds: [newId()],
    chapterNumbers: [1],
    style: 'balanced',
    prompt: 'hello',
    baseContext: '',
    operationPrompt: 'hello',
    operationType: 'TRANSLATE',
    sections: {
      taskHeader: '',
      criticalRules: '',
      hotMemoryDelta: '',
      activeProjectTerms: '',
      sourceParagraphs: '',
      outputProtocol: '',
    },
    size: {
      sourceChars: 5,
      contextChars: 0,
      totalChars: 5,
      estimatedTokens: 2,
      activeTermCount: 0,
      activeCharacterCount: 0,
      relationshipCount: 0,
      recentMemoryCount: 0,
      paragraphCount: 1,
      chapterCount: 1,
    },
    promptHash: 'abc',
  };
}

function mockProvider(
  id: string,
  type: IAIProvider['providerType'],
  send: () => Promise<AIResponse>,
): IAIProvider {
  return {
    providerId: id,
    providerType: type,
    initialize: vi.fn(() => Promise.resolve()),
    healthCheck: vi.fn(() => Promise.resolve({
      ok: true,
      status: 'READY' as const,
      message: 'ok',
    })),
    sendPrompt: vi.fn(send),
    cancelRequest: vi.fn(() => Promise.resolve()),
    getStatus: vi.fn(() => Promise.resolve({
      providerId: id,
      type,
      ready: true,
      message: 'ok',
    })),
    close: vi.fn(() => Promise.resolve()),
  };
}

function mockDb(providers: { id: string; fallback_allowed: number }[]) {
  return {
    aiProviders: {
      listEnabledOrdered: () =>
        providers.map((p, i) => ({
          id: p.id,
          name: p.id,
          type: 'GEMINI_WEB_API',
          status: 'READY',
          priority: i + 1,
          enabled: 1,
          fallback_allowed: p.fallback_allowed,
          created_at: '',
          updated_at: '',
        })),
      getById: (id: string) =>
        providers.find((p) => p.id === id)
          ? {
              id,
              name: id,
              type: 'GEMINI_WEB_API',
              status: 'READY',
              priority: 1,
              enabled: 1,
              fallback_allowed: providers.find((p) => p.id === id)?.fallback_allowed,
              created_at: '',
              updated_at: '',
            }
          : null,
    },
    appMeta: {
      get: (key: string) => {
        if (key === 'ai.fallback.enabled') return '1';
        if (key === 'ai.fallback.on_statuses') {
          return JSON.stringify(['RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'LOGIN_REQUIRED']);
        }
        return null;
      },
      set: vi.fn(),
    },
    aiAccounts: {
      listReadyByProvider: () => [{ id: 'ai-ready' }],
    },
    notebooks: {
      listByProjectAndWorker: () => [] as { status: string; notebook_role?: string }[],
    },
  } as unknown as ConstructorParameters<typeof AiProviderManager>[0];
}

describe('AiProviderManager selection + fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses first successful provider without calling next', async () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () => Promise.resolve({
      requestId: '1',
      status: 'SUCCESS',
      text: 'from-web',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      () => Promise.resolve({
        requestId: '2',
        status: 'SUCCESS',
        text: 'from-browser',
      }),
    );

    const manager = new AiProviderManager(
      mockDb([
        { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
        { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
      ]),
    );
    manager.register(web);
    manager.register(browser);

    const result = await manager.sendWithFallback(minimalPack());
    expect(result.text).toBe('from-web');
    expect(Reflect.get(web, "sendPrompt")).toHaveBeenCalledOnce();
    expect(Reflect.get(browser, "sendPrompt")).not.toHaveBeenCalled();
  });

  it('falls back on RATE_LIMIT when enabled', async () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () => Promise.resolve({
      requestId: '1',
      status: 'RATE_LIMIT',
      text: '',
      errorMessage: 'quota',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      () => Promise.resolve({
        requestId: '2',
        status: 'SUCCESS',
        text: 'from-browser',
      }),
    );

    const manager = new AiProviderManager(
      mockDb([
        { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
        { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
      ]),
    );
    manager.register(web);
    manager.register(browser);

    const result = await manager.sendWithFallback(minimalPack());
    expect(result.text).toBe('from-browser');
    expect(Reflect.get(web, "sendPrompt")).toHaveBeenCalledOnce();
    expect(Reflect.get(browser, "sendPrompt")).toHaveBeenCalledOnce();
  });

  it('does not fallback when provider locks fallback_allowed=0', async () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () => Promise.resolve({
      requestId: '1',
      status: 'RATE_LIMIT',
      text: '',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      () => Promise.resolve({
        requestId: '2',
        status: 'SUCCESS',
        text: 'from-browser',
      }),
    );

    const manager = new AiProviderManager(
      mockDb([
        { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 0 },
        { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
      ]),
    );
    manager.register(web);
    manager.register(browser);

    const result = await manager.sendWithFallback(minimalPack());
    expect(result.status).toBe('RATE_LIMIT');
    expect(Reflect.get(browser, "sendPrompt")).not.toHaveBeenCalled();
  });

  it('skips Web API when no READY account and uses the next provider', async () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () => Promise.resolve({
      requestId: '1',
      status: 'SUCCESS',
      text: 'from-web',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      () => Promise.resolve({
        requestId: '2',
        status: 'SUCCESS',
        text: 'from-browser',
      }),
    );

    const db = mockDb([
      { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
      { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
    ]);
    db.aiAccounts.listReadyByProvider = (providerId: string) =>
      providerId === AI_PROVIDER_IDS.GEMINI_WEB_API
        ? []
        : ([{ id: 'ai-ready' }] as import('../../../src/main/db/repositories/ai-account-repository').AiAccountRow[]);

    const manager = new AiProviderManager(db);
    manager.register(web);
    manager.register(browser);

    const result = await manager.sendWithFallback(minimalPack());
    expect(result.text).toBe('from-browser');
    expect(Reflect.get(web, "sendPrompt")).not.toHaveBeenCalled();
    expect(Reflect.get(browser, "sendPrompt")).toHaveBeenCalledOnce();
  });

  it('falls back when SUCCESS text is a Gemini soft error', async () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () => Promise.resolve({
      requestId: '1',
      status: 'SUCCESS',
      text: 'Sorry, something went wrong. Please try your request again.',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      () => Promise.resolve({
        requestId: '2',
        status: 'SUCCESS',
        text: 'from-browser',
      }),
    );

    const manager = new AiProviderManager(
      mockDb([
        { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
        { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
      ]),
    );
    manager.register(web);
    manager.register(browser);

    const result = await manager.sendWithFallback(minimalPack());
    expect(result.text).toBe('from-browser');
    expect(Reflect.get(browser, "sendPrompt")).toHaveBeenCalledOnce();
  });

  it('falls back on SESSION_EXPIRED even when app_meta omits auth statuses', async () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () => Promise.resolve({
      requestId: '1',
      status: 'SESSION_EXPIRED',
      text: '',
      errorMessage: 'no session',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      () => Promise.resolve({
        requestId: '2',
        status: 'SUCCESS',
        text: 'from-browser',
      }),
    );

    const narrowMetaDb = {
      ...(mockDb([
        { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
        { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
      ]) as unknown as Record<string, unknown>),
      appMeta: {
        get: (key: string) => {
          if (key === 'ai.fallback.enabled') return '1';
          if (key === 'ai.fallback.on_statuses') {
            return JSON.stringify(['RATE_LIMIT', 'SERVICE_UNAVAILABLE']);
          }
          return null;
        },
        set: vi.fn(),
      },
    } as unknown as ConstructorParameters<typeof AiProviderManager>[0];

    const manager = new AiProviderManager(narrowMetaDb);
    manager.register(web);
    manager.register(browser);

    const result = await manager.sendWithFallback(minimalPack());
    expect(result.text).toBe('from-browser');
    expect(Reflect.get(browser, "sendPrompt")).toHaveBeenCalledOnce();
  });

  it('respects DB order when Playwright is listed before Web API and notebook is ready', () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () => Promise.resolve({
      requestId: '1',
      status: 'SUCCESS',
      text: 'web',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      () => Promise.resolve({
        requestId: '2',
        status: 'SUCCESS',
        text: 'browser',
      }),
    );

    const db = mockDb([
      { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
      { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
    ]);
    db.notebooks.listByProjectAndWorker = () =>
      [{ status: 'ready', notebook_role: 'TRANSLATION', resource_url: 'https://x' }] as never;

    const manager = new AiProviderManager(db);
    manager.register(browser);
    manager.register(web);

    const ordered = manager.selectOrderedProviders({
      projectId: newId(),
      googleAccountId: newId(),
    });
    expect(ordered.map((p) => p.providerType)).toEqual([
      'PLAYWRIGHT_GEMINI',
      'GEMINI_WEB_API',
    ]);
  });

  it('demotes Playwright when notebook is not ready even if DB lists it first', () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () => Promise.resolve({
      requestId: '1',
      status: 'SUCCESS',
      text: 'web',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      () => Promise.resolve({
        requestId: '2',
        status: 'SUCCESS',
        text: 'browser',
      }),
    );

    const db = mockDb([
      { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
      { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
    ]);
    db.notebooks.listByProjectAndWorker = () => [];

    const manager = new AiProviderManager(db);
    manager.register(browser);
    manager.register(web);

    const ordered = manager.selectOrderedProviders({
      projectId: newId(),
      googleAccountId: newId(),
    });
    expect(ordered.map((p) => p.providerType)).toEqual([
      'GEMINI_WEB_API',
      'PLAYWRIGHT_GEMINI',
    ]);
  });

  it('keeps DB order (Web API first) when notebook ready and Web API listed first', () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () => Promise.resolve({
      requestId: '1',
      status: 'SUCCESS',
      text: 'web',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      () => Promise.resolve({
        requestId: '2',
        status: 'SUCCESS',
        text: 'browser',
      }),
    );

    const db = mockDb([
      { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
      { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
    ]);
    db.aiAccounts.listReadyByProvider = () => [];
    db.notebooks.listByProjectAndWorker = () =>
      [{ status: 'ready', notebook_role: 'TRANSLATION' }] as never;

    const manager = new AiProviderManager(db);
    manager.register(web);
    manager.register(browser);

    const ordered = manager.selectOrderedProviders({
      projectId: newId(),
      googleAccountId: newId(),
    });
    expect(ordered.map((p) => p.providerType)).toEqual([
      'GEMINI_WEB_API',
      'PLAYWRIGHT_GEMINI',
    ]);
  });
});
