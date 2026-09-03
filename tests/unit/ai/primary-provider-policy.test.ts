import { describe, expect, it, vi } from 'vitest';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { AI_ROUTING_META_KEYS } from '@shared/constants/provider-preflight';
import {
  resolvePrimaryProviderId,
  applyPrimaryProvider,
} from '@main/ai/primary-provider-policy';
import type { AiProviderService } from '@main/ai/ai-provider-service';

function mockDb(options?: {
  globalPrimary?: string | null;
  projectStyle?: string | null;
  enabledIds?: string[];
}) {
  const meta = new Map<string, string>();
  if (options?.globalPrimary) {
    meta.set(AI_ROUTING_META_KEYS.primaryProviderId, options.globalPrimary);
  }

  const enabledIds =
    options?.enabledIds ??
    [
      AI_PROVIDER_IDS.GEMINI_WEB_API,
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
    ];

  return {
    appMeta: {
      get: (key: string) => meta.get(key) ?? null,
      set: (key: string, value: string) => {
        meta.set(key, value);
      },
    },
    googleAccounts: {
      list: () => [] as { status: string }[],
    },
    aiAccounts: {
      listByProvider: () => [] as { status: string }[],
    },
    projects: {
      getStyleConfig: () => options?.projectStyle ?? null,
    },
    aiProviders: {
      listEnabledOrdered: () =>
        enabledIds.map((id, index) => ({
          id,
          name: id,
          priority: index + 1,
          enabled: 1,
          status: 'READY',
        })),
      getById: (id: string) =>
        enabledIds.includes(id)
          ? { id, name: id, priority: enabledIds.indexOf(id) + 1, enabled: 1, status: 'READY' }
          : null,
      setPriority: vi.fn(),
    },
  } as unknown as import('@main/db/database-manager').DatabaseManager;
}

describe('resolvePrimaryProviderId', () => {
  it('uses project override when set', () => {
    const db = mockDb({
      globalPrimary: AI_PROVIDER_IDS.GEMINI_WEB_API,
      projectStyle: JSON.stringify({
        primaryProviderId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      }),
    });
    expect(resolvePrimaryProviderId(db, 'project-1')).toBe(
      AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
    );
  });

  it('inherits global meta when project uses global primary', () => {
    const db = mockDb({
      globalPrimary: AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
      projectStyle: JSON.stringify({ preferNotebookPack: true }),
    });
    expect(resolvePrimaryProviderId(db, 'project-1')).toBe(
      AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
    );
  });

  it('falls back to first ready provider under AUTO preference', () => {
    const db = mockDb({
      enabledIds: [
        AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        AI_PROVIDER_IDS.GEMINI_WEB_API,
      ],
    });
    expect(resolvePrimaryProviderId(db)).toBe(AI_PROVIDER_IDS.GEMINI_WEB_API);
  });
});

describe('applyPrimaryProvider', () => {
  it('sets AUTO routing, fallback, and priority order', () => {
    const db = mockDb();
    const setEnabled = vi.fn();
    const setFallback = vi.fn();
    const setPriority = vi.fn();
    const setRoutingMode = vi.fn();
    const setPrimaryProviderId = vi.fn();
    const service = {
      setEnabled,
      setFallback,
      setPriority,
      manager: {
        setRoutingMode,
        setPrimaryProviderId,
      },
    } as unknown as AiProviderService;

    applyPrimaryProvider(db, service, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

    expect(setEnabled).toHaveBeenCalledWith(
      AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      true,
    );
    expect(setRoutingMode).toHaveBeenCalledWith('AUTO');
    expect(setPrimaryProviderId).toHaveBeenCalledWith(
      AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
    );
    expect(setFallback).toHaveBeenCalledWith(true);
    expect(setPriority).toHaveBeenCalledWith(
      AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      1,
    );
  });

  it('rejects non-translation provider ids', () => {
    const db = mockDb();
    const service = {} as AiProviderService;
    expect(() => { applyPrimaryProvider(db, service, 'notebooklm'); }).toThrow(
      /không hỗ trợ/,
    );
  });
});
