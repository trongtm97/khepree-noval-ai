import { describe, expect, it } from 'vitest';
import {
  getProviderCapabilities,
  isBrowserTransportType,
  providerIdForType,
  PROVIDER_CAPABILITY_REGISTRY,
} from '@main/ai/provider-capabilities';
import { resolveChunkingPolicy } from '@main/ai/provider-chunking-policy';
import {
  classifyAiResponseText,
  getResponseClassifier,
} from '@shared/utils/provider-response-classifier';
import { resolveProviderCharBudget } from '@main/jobs/batch-sizer';
import { PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK } from '@shared/constants/job';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';

describe('ProviderCapabilities registry', () => {
  it('registers all production provider types', () => {
    expect(PROVIDER_CAPABILITY_REGISTRY.PLAYWRIGHT_GEMINI.transport).toBe('BROWSER');
    expect(PROVIDER_CAPABILITY_REGISTRY.PLAYWRIGHT_CHATGPT.transport).toBe('BROWSER');
    expect(PROVIDER_CAPABILITY_REGISTRY.PLAYWRIGHT_META_AI.transport).toBe('BROWSER');
    expect(PROVIDER_CAPABILITY_REGISTRY.GEMINI_WEB_API.transport).toBe('LOCAL_WORKER');
  });

  it('maps provider id ↔ type', () => {
    expect(providerIdForType('PLAYWRIGHT_CHATGPT')).toBe(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
  });

  it('browser transport is not Gemini-only', () => {
    expect(isBrowserTransportType('PLAYWRIGHT_GEMINI')).toBe(true);
    expect(isBrowserTransportType('PLAYWRIGHT_CHATGPT')).toBe(true);
    expect(isBrowserTransportType('PLAYWRIGHT_META_AI')).toBe(true);
    expect(isBrowserTransportType('GEMINI_WEB_API')).toBe(false);
  });

  it('ChatGPT/Meta get browser char budget (not Web API limits)', () => {
    const chatgpt = resolveProviderCharBudget('PLAYWRIGHT_CHATGPT');
    const web = resolveProviderCharBudget('GEMINI_WEB_API');
    expect(chatgpt.maxSourceChars).toBeGreaterThan(web.maxSourceChars);
    expect(chatgpt.maxParagraphs).toBeGreaterThan(web.maxParagraphs);
  });

  it('Gemini browser keeps large chunk budget', () => {
    const gemini = resolveChunkingPolicy('PLAYWRIGHT_GEMINI');
    expect(gemini.useBrowserChunking).toBe(true);
    expect(gemini.maxSourceChars).toBe(PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK);
  });

  it('all translation providers support local context', () => {
    for (const type of [
      'PLAYWRIGHT_GEMINI',
      'PLAYWRIGHT_CHATGPT',
      'PLAYWRIGHT_META_AI',
      'GEMINI_WEB_API',
    ] as const) {
      expect(getProviderCapabilities(type).supportsLocalContext).toBe(true);
    }
  });

  it('per-provider timeouts exist (not one shared constant path)', () => {
    const browser = getProviderCapabilities('PLAYWRIGHT_CHATGPT').timeouts;
    const worker = getProviderCapabilities('GEMINI_WEB_API').timeouts;
    expect(browser.sendConfirmMs).toBeGreaterThan(worker.sendConfirmMs);
  });
});

describe('ProviderResponseClassifier', () => {
  it('Gemini classifier detects polite errors', () => {
    const c = getResponseClassifier('PLAYWRIGHT_GEMINI');
    expect(
      c.classifyResponseText('Sorry, something went wrong. Please try your request again.'),
    ).toBe('CONTENT_REJECTED');
  });

  it('ChatGPT classifier does not use GEMINI_SOFT_ERROR code', () => {
    const classified = classifyAiResponseText(
      'Rate limit reached. Please try again later.',
      'PLAYWRIGHT_CHATGPT',
    );
    expect(classified?.kind).toBe('RATE_LIMIT');
  });

  it('Meta classifier detects soft errors', () => {
    const classified = classifyAiResponseText(
      'Something went wrong. Unable to respond.',
      'PLAYWRIGHT_META_AI',
    );
    expect(classified?.kind).toBe('CONTENT_REJECTED');
  });

  it('translation protocol payload is not classified as soft error', () => {
    const text = '<TRANSLATION>\n[C000001:P000001] hello\n</TRANSLATION>';
    expect(classifyAiResponseText(text, 'PLAYWRIGHT_CHATGPT')).toBeNull();
  });
});
