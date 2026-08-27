import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AiProviderManager } from '@main/ai/ai-provider-manager';
import type { IAIProvider } from '@main/ai/iai-provider';
import type { AIResponse } from '@main/ai/types';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { newId } from '@main/db/utils/uuid';
import {
  filterProvidersByPreflight,
  type ProviderPreflightReport,
} from '@main/ai/provider-preflight';
import { formatTranslateChannel } from '@shared/utils/translate-channel';

vi.mock('@main/ai/provider-preflight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/ai/provider-preflight')>();
  return {
    ...actual,
    checkProviderForJob: vi.fn(),
  };
});

import { checkProviderForJob } from '@main/ai/provider-preflight';

function minimalPack(): TranslationPackDto {
  return {
    projectId: newId(),
    chapterIds: [newId()],
    chapterNumbers: [1],
    style: 'balanced',
    prompt: 'hello',
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
    initialize: vi.fn(async () => undefined),
    healthCheck: vi.fn(async () => ({
      ok: true,
      status: 'READY' as const,
      message: 'ok',
    })),
    sendPrompt: vi.fn(send),
    cancelRequest: vi.fn(async () => undefined),
    getStatus: vi.fn(async () => ({
      providerId: id,
      type,
      ready: true,
      message: 'ok',
    })),
    close: vi.fn(async () => undefined),
  };
}

function mockDb(providers: Array<{ id: string; fallback_allowed: number }>) {
  return {
    aiProviders: {
      listEnabledOrdered: () =>
        providers.map((p, i) => ({
          id: p.id,
          name: p.id,
          type: p.id.includes('playwright') ? 'PLAYWRIGHT_GEMINI' : 'GEMINI_WEB_API',
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
              type: id.includes('playwright') ? 'PLAYWRIGHT_GEMINI' : 'GEMINI_WEB_API',
              status: 'READY',
              priority: 1,
              enabled: 1,
              fallback_allowed: providers.find((p) => p.id === id)!.fallback_allowed,
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
        if (key === 'ai.routing.mode') return 'AUTO';
        return null;
      },
      set: vi.fn(),
    },
    aiAccounts: {
      listReadyByProvider: () => [{ id: 'ai-ready' }],
    },
    notebooks: {
      getByProjectAndWorker: () => null as { status: string } | null,
      listByProjectAndWorker: () => [] as { status: string; notebook_role?: string }[],
    },
  } as unknown as ConstructorParameters<typeof AiProviderManager>[0];
}

describe('filterProvidersByPreflight', () => {
  it('AUTO prefers READY and skips UNAVAILABLE Playwright object', () => {
    const reports: ProviderPreflightReport[] = [
      {
        providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        result: 'NOTEBOOK_ERROR',
        message: 'no notebook',
        checks: {},
      },
      {
        providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
        result: 'READY',
        message: 'ok',
        checks: {},
      },
    ];
    const usable = filterProvidersByPreflight(reports, 'AUTO');
    expect(usable.map((r) => r.providerId)).toEqual([AI_PROVIDER_IDS.GEMINI_WEB_API]);
  });

  it('PIN keeps only first usable (no auto-switch list)', () => {
    const reports: ProviderPreflightReport[] = [
      {
        providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        result: 'READY',
        message: 'ok',
        checks: {},
      },
      {
        providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
        result: 'READY',
        message: 'ok',
        checks: {},
      },
    ];
    expect(filterProvidersByPreflight(reports, 'PIN')).toHaveLength(1);
  });
});

describe('AiProviderManager account-aware routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call Playwright send when preflight is NOTEBOOK_ERROR', async () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', async () => ({
      requestId: '1',
      status: 'SUCCESS',
      text: 'from-web',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      async () => ({
        requestId: '2',
        status: 'SUCCESS',
        text: 'from-browser',
      }),
    );

    vi.mocked(checkProviderForJob).mockImplementation(async (_db, input) => {
      if (input.providerId === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI) {
        return {
          providerId: input.providerId,
          result: 'NOTEBOOK_ERROR',
          message: 'no notebook',
          checks: {},
        };
      }
      return {
        providerId: input.providerId,
        result: 'READY',
        message: 'ok',
        checks: {},
      };
    });

    const db = mockDb([
      { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
      { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
    ]);
    const manager = new AiProviderManager(db);
    manager.register(browser);
    manager.register(web);

    const projectId = newId();
    const accountId = newId();
    const result = await manager.sendWithFallback(minimalPack(), {
      projectId,
      googleAccountId: accountId,
    });

    expect(result.text).toBe('from-web');
    expect(browser.sendPrompt).not.toHaveBeenCalled();
    expect(web.sendPrompt).toHaveBeenCalledOnce();
  });

  it('PIN mode does not fallback to next provider', async () => {
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', async () => ({
      requestId: '1',
      status: 'RATE_LIMIT',
      text: '',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      async () => ({
        requestId: '2',
        status: 'SUCCESS',
        text: 'from-browser',
      }),
    );

    vi.mocked(checkProviderForJob).mockResolvedValue({
      providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
      result: 'READY',
      message: 'ok',
      checks: {},
    });

    const db = mockDb([
      { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
      { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
    ]);
    db.appMeta.get = (key: string) => {
      if (key === 'ai.routing.mode') return 'PIN';
      if (key === 'ai.routing.pinned_provider_id') return AI_PROVIDER_IDS.GEMINI_WEB_API;
      if (key === 'ai.fallback.enabled') return '1';
      if (key === 'ai.fallback.on_statuses') {
        return JSON.stringify(['RATE_LIMIT']);
      }
      return null;
    };

    const manager = new AiProviderManager(db);
    manager.register(web);
    manager.register(browser);

    const result = await manager.sendWithFallback(minimalPack(), {
      projectId: newId(),
      googleAccountId: newId(),
      pinnedProviderId: AI_PROVIDER_IDS.GEMINI_WEB_API,
    });

    expect(result.status).toBe('RATE_LIMIT');
    expect(browser.sendPrompt).not.toHaveBeenCalled();
  });

  it('selectProvidersForJob skips Playwright object that fails preflight', async () => {
    vi.mocked(checkProviderForJob).mockImplementation(async (_db, input) => ({
      providerId: input.providerId,
      result:
        input.providerId === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI
          ? 'UNAVAILABLE'
          : 'READY',
      message: 'x',
      checks: {},
    }));

    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', async () => ({
      requestId: '1',
      status: 'SUCCESS',
      text: 'web',
    }));
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      async () => ({
        requestId: '2',
        status: 'SUCCESS',
        text: 'browser',
      }),
    );

    const manager = new AiProviderManager(
      mockDb([
        { id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, fallback_allowed: 1 },
        { id: AI_PROVIDER_IDS.GEMINI_WEB_API, fallback_allowed: 1 },
      ]),
    );
    manager.register(browser);
    manager.register(web);

    const { providers } = await manager.selectProvidersForJob({
      projectId: newId(),
      googleAccountId: newId(),
    });
    expect(providers.map((p) => p.providerType)).toEqual(['GEMINI_WEB_API']);
  });
});

describe('formatTranslateChannel', () => {
  it('labels Notebook vs Web API + local memory clearly', () => {
    expect(formatTranslateChannel({ providerType: 'PLAYWRIGHT_GEMINI' })).toBe(
      'Đang dùng Gemini Notebook',
    );
    expect(formatTranslateChannel({ providerType: 'GEMINI_WEB_API' })).toBe(
      'Đang dùng Gemini Web API + bộ nhớ cục bộ',
    );
  });
});
