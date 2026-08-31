import type { AiProviderType } from '@shared/constants/ai-provider';
import {
  DEFAULT_TRANSLATE_BATCH_PARAGRAPHS,
  PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK,
  PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS,
  WEB_API_MAX_SOURCE_CHARS_PER_CHUNK,
} from '@shared/constants/job';
import {
  getProviderCapabilities,
  isBrowserTransport,
  type ProviderCapabilities,
} from './provider-capabilities';

export interface ChunkingPolicy {
  transport: ProviderCapabilities['transport'];
  maxParagraphs: number;
  maxSourceChars: number;
  useBrowserChunking: boolean;
}

export function resolveChunkingPolicy(
  providerType: AiProviderType | string | null | undefined,
): ChunkingPolicy {
  const caps = getProviderCapabilities(providerType);
  return {
    transport: caps.transport,
    maxParagraphs: caps.recommendedParagraphsPerChunk,
    maxSourceChars: caps.hardPromptChars ?? caps.recommendedPromptChars,
    useBrowserChunking: isBrowserTransport(caps),
  };
}

/** Max paragraphs per translate batch — capability-driven, not Gemini-named. */
export function resolveTranslateBatchParagraphs(
  providerType: AiProviderType | string | null | undefined,
): number {
  return resolveChunkingPolicy(providerType).maxParagraphs;
}

/** Char budget for batch sizer — adapts to provider capability + optional history shrink. */
export function resolveProviderCharBudget(
  providerType: AiProviderType | string | null | undefined,
  history?: {
    avgOutputRatio: number;
    recentIncompleteRate: number;
    recentSuccessRate: number;
  },
): { maxSourceChars: number; maxParagraphs: number } {
  const policy = resolveChunkingPolicy(providerType);
  let maxSourceChars = policy.maxSourceChars;
  const maxParagraphs = policy.maxParagraphs;

  if (history) {
    if (history.recentIncompleteRate >= 0.35) {
      maxSourceChars = Math.floor(maxSourceChars * 0.65);
    } else if (history.recentIncompleteRate >= 0.15) {
      maxSourceChars = Math.floor(maxSourceChars * 0.8);
    }
    const ratioHeadroom = history.avgOutputRatio > 1.5 ? 0.85 : 1;
    maxSourceChars = Math.floor(maxSourceChars / ratioHeadroom);
  }

  return { maxSourceChars, maxParagraphs };
}

/** Legacy aliases for imports that still reference job.ts constant names. */
export const BROWSER_TRANSLATE_BATCH_PARAGRAPHS = PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS;
export const BROWSER_MAX_SOURCE_CHARS_PER_CHUNK = PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK;
export const WEB_API_TRANSLATE_BATCH_PARAGRAPHS = DEFAULT_TRANSLATE_BATCH_PARAGRAPHS;
export const WEB_API_MAX_CHARS = WEB_API_MAX_SOURCE_CHARS_PER_CHUNK;
