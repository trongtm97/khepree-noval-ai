/**
 * Provider-specific response classifiers — generic error classes only.
 * Do not expose GEMINI_SOFT_ERROR to callers; use classified categories.
 */

import type { AiProviderType } from '@shared/constants/ai-provider';
import { isGeminiSoftErrorText, geminiSoftErrorSnippet } from './gemini-soft-error';

export type ClassifiedResponseError =
  | 'RATE_LIMIT'
  | 'SERVICE_UNAVAILABLE'
  | 'LOGIN_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'CONTENT_REJECTED'
  | 'EMPTY_RESPONSE'
  | 'UNKNOWN';

export interface ClassifiedSoftError {
  kind: ClassifiedResponseError;
  snippet: string;
  providerType: AiProviderType | null;
}

const CHATGPT_PATTERNS: RegExp[] = [
  /something went wrong/i,
  /rate limit/i,
  /too many requests/i,
  /please try again later/i,
  /login required/i,
  /session expired/i,
];

const META_PATTERNS: RegExp[] = [
  /something went wrong/i,
  /unable to respond/i,
  /try again/i,
  /rate limit/i,
  /login/i,
];

function looksLikeTranslationPayload(text: string): boolean {
  if (/<(TRANSLATION|TERM_DELTA|MEMORY_DELTA)>/i.test(text)) return true;
  if (/\[C\d{6}:P\d{6}\]/.test(text)) return true;
  return false;
}

function classifyByPatterns(
  text: string,
  patterns: RegExp[],
): ClassifiedResponseError | null {
  if (/rate limit|too many requests/i.test(text)) return 'RATE_LIMIT';
  if (/login required|sign in/i.test(text)) return 'LOGIN_REQUIRED';
  if (/session expired|expired session/i.test(text)) return 'SESSION_EXPIRED';
  if (patterns.some((re) => re.test(text))) return 'CONTENT_REJECTED';
  return null;
}

export interface ProviderResponseClassifier {
  classifyResponseText(raw: string | null | undefined): ClassifiedResponseError | null;
  snippet(raw: string | null | undefined): string;
}

function createClassifier(
  providerType: AiProviderType,
  extraPatterns: RegExp[] = [],
): ProviderResponseClassifier {
  return {
    classifyResponseText(raw) {
      if (!raw?.trim()) return 'EMPTY_RESPONSE';
      const text = raw.trim();
      if (text.length > 800) return null;
      if (looksLikeTranslationPayload(text)) return null;

      if (providerType === 'PLAYWRIGHT_GEMINI' || providerType === 'GEMINI_WEB_API') {
        if (isGeminiSoftErrorText(text)) return 'CONTENT_REJECTED';
      }

      return classifyByPatterns(text, extraPatterns);
    },
    snippet(raw) {
      if (!raw?.trim()) return '(empty response)';
      if (providerType === 'PLAYWRIGHT_GEMINI' || providerType === 'GEMINI_WEB_API') {
        return geminiSoftErrorSnippet(raw);
      }
      const oneLine = raw.trim().replace(/\s+/g, ' ');
      return oneLine.length <= 160 ? oneLine : `${oneLine.slice(0, 160)}…`;
    },
  };
}

const CLASSIFIERS: Partial<Record<AiProviderType, ProviderResponseClassifier>> = {
  PLAYWRIGHT_GEMINI: createClassifier('PLAYWRIGHT_GEMINI'),
  GEMINI_WEB_API: createClassifier('GEMINI_WEB_API'),
  PLAYWRIGHT_CHATGPT: createClassifier('PLAYWRIGHT_CHATGPT', CHATGPT_PATTERNS),
  PLAYWRIGHT_META_AI: createClassifier('PLAYWRIGHT_META_AI', META_PATTERNS),
  GEMINI_OFFICIAL: createClassifier('GEMINI_OFFICIAL'),
};

const GENERIC_CLASSIFIER: ProviderResponseClassifier = {
  classifyResponseText(raw) {
    if (!raw?.trim()) return 'EMPTY_RESPONSE';
    const text = raw.trim();
    if (text.length > 800 || looksLikeTranslationPayload(text)) return null;
    if (isGeminiSoftErrorText(text)) return 'CONTENT_REJECTED';
    return (
      classifyByPatterns(text, [...CHATGPT_PATTERNS, ...META_PATTERNS]) ?? null
    );
  },
  snippet(raw) {
    if (!raw?.trim()) return '(empty response)';
    return geminiSoftErrorSnippet(raw);
  },
};

export function getResponseClassifier(
  providerType: AiProviderType | string | null | undefined,
): ProviderResponseClassifier {
  if (providerType && providerType in CLASSIFIERS) {
    return CLASSIFIERS[providerType as AiProviderType]!;
  }
  return GENERIC_CLASSIFIER;
}

/** Classify soft-error text from any provider — prefer provider-specific classifier. */
export function classifyAiResponseText(
  raw: string | null | undefined,
  providerType?: AiProviderType | string | null,
): ClassifiedSoftError | null {
  const classifier = getResponseClassifier(providerType ?? null);
  const kind = classifier.classifyResponseText(raw);
  if (!kind) return null;
  return {
    kind,
    snippet: classifier.snippet(raw),
    providerType: (providerType as AiProviderType) ?? null,
  };
}

/** Back-compat wrapper — true when response text is a provider soft error, not translation. */
export function isAiSoftErrorText(
  raw: string | null | undefined,
  providerType?: AiProviderType | string | null,
): boolean {
  return classifyAiResponseText(raw, providerType) !== null;
}

export { geminiSoftErrorSnippet, isGeminiSoftErrorText };
