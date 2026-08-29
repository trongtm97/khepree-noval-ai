import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { evaluateTranslatePreflight } from '../../../src/renderer/utils/translate-preflight';

describe('evaluateTranslatePreflight primary-aware channel', () => {
  const base = {
    hasProject: true,
    hasChapter: true,
    paragraphCount: 3,
    workers: [{ health: 'READY', accountId: 'acc-1' }],
    googleAccounts: [{ id: 'acc-1', status: 'READY' }],
    aiAccounts: [{ status: 'LOGIN_REQUIRED' }],
    browserAiAccounts: [] as { status: string; providerId?: string }[],
    notebookStatus: null as string | null,
    resolvedWorkerAccountId: 'acc-1' as string | null,
    fallbackEnabled: true,
    providerRows: [
      { id: AI_PROVIDER_IDS.GEMINI_WEB_API, status: 'LOGIN_REQUIRED', enabled: true },
      { id: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, status: 'READY', enabled: true },
    ],
  };

  it('passes when ChatGPT is primary and READY without notebook', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      primaryProviderId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      browserAiAccounts: [{ status: 'READY', providerId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notebookReady).toBe(false);
      expect(result.webApiReady).toBe(true);
    }
  });

  it('fails no_channel when primary and all enabled fallbacks are not ready', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      primaryProviderId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      fallbackEnabled: false,
      browserAiAccounts: [{ status: 'LOGIN_REQUIRED', providerId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT }],
      providerRows: [
        { id: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, status: 'LOGIN_REQUIRED', enabled: true },
      ],
    });
    expect(result).toEqual({ ok: false, reason: 'no_channel' });
  });

  it('uses fallback provider when primary is not ready', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      primaryProviderId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      browserAiAccounts: [{ status: 'LOGIN_REQUIRED', providerId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT }],
      providerRows: [
        { id: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, status: 'LOGIN_REQUIRED', enabled: true },
        { id: AI_PROVIDER_IDS.GEMINI_WEB_API, status: 'READY', enabled: true },
      ],
      aiAccounts: [{ status: 'READY' }],
    });
    expect(result.ok).toBe(true);
  });
});
