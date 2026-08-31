import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import {
  resolveAutoPrimaryProviderId,
  resolvePrimaryForPreference,
  type ProviderReadinessInput,
} from '@main/ai/ai-preference-policy';

function readiness(partial: Partial<ProviderReadinessInput>): ProviderReadinessInput {
  return {
    readyProviderIds: partial.readyProviderIds ?? new Set(),
    groupAccountReady: partial.groupAccountReady ?? {
      GEMINI: false,
      CHATGPT: false,
      META_AI: false,
    },
  };
}

describe('AiPreference routing', () => {
  it('AUTO selects Meta when only Meta is ready', () => {
    const id = resolveAutoPrimaryProviderId(
      readiness({
        readyProviderIds: new Set([AI_PROVIDER_IDS.PLAYWRIGHT_META_AI]),
        groupAccountReady: { GEMINI: false, CHATGPT: false, META_AI: true },
      }),
    );
    expect(id).toBe(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);
  });

  it('AUTO selects ChatGPT when only ChatGPT is ready', () => {
    const id = resolveAutoPrimaryProviderId(
      readiness({
        readyProviderIds: new Set([AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT]),
        groupAccountReady: { GEMINI: false, CHATGPT: true, META_AI: false },
      }),
    );
    expect(id).toBe(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
  });

  it('user preference ChatGPT picks ChatGPT provider', () => {
    const id = resolvePrimaryForPreference(
      'CHATGPT',
      readiness({
        readyProviderIds: new Set([
          AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
          AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
        ]),
        groupAccountReady: { GEMINI: true, CHATGPT: true, META_AI: true },
      }),
    );
    expect(id).toBe(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
  });

  it('Gemini preference prefers Web API when ready', () => {
    const id = resolvePrimaryForPreference(
      'GEMINI',
      readiness({
        readyProviderIds: new Set([
          AI_PROVIDER_IDS.GEMINI_WEB_API,
          AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        ]),
        groupAccountReady: { GEMINI: true, CHATGPT: false, META_AI: false },
      }),
    );
    expect(id).toBe(AI_PROVIDER_IDS.GEMINI_WEB_API);
  });
});
