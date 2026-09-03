import {
  DEFAULT_MAX_CHAPTERS_PER_JOB,
  DEFAULT_TRANSLATE_BATCH_PARAGRAPHS,
  PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK,
  PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS,
  WEB_API_MAX_SOURCE_CHARS_PER_CHUNK,
} from '@shared/constants/job';
import { HARD_GLOBAL_WORKER_CEILING } from '@shared/constants/concurrency-policy';
import {
  getProviderCapabilities,
  isBrowserTransport,
} from '@main/ai/provider-capabilities';

export interface ThroughputHistory {
  avgOutputRatio: number;
  recentIncompleteRate: number;
  recentSuccessRate: number;
}

export const DEFAULT_THROUGHPUT_HISTORY: ThroughputHistory = {
  avgOutputRatio: 1.25,
  recentIncompleteRate: 0,
  recentSuccessRate: 1,
};

/** gemini-web2api thinking model — longer output budget (~20k chars). */
export const WEB_API_THINKING_MODEL = 'gemini-3.5-flash-thinking';

const WEB_API_PARAGRAPHS_BOOST = 18;
const WEB_API_PARAGRAPHS_BASE = 16;
const WEB_API_PARAGRAPHS_SAFE = 10;

const WEB_API_CHARS_BOOST = 12_000;
const WEB_API_CHARS_BASE = 10_000;
const WEB_API_CHARS_SAFE = 6_500;

const WEB_API_DELAY_FAST_MS = 1_200;
const WEB_API_DELAY_BASE_MS = 1_800;
const WEB_API_DELAY_SAFE_MS = 2_500;

const THINKING_SOURCE_CHAR_THRESHOLD = 7_000;

export interface AutoChunkBudget {
  maxParagraphs: number;
  maxSourceChars: number;
  useBrowserChunking: boolean;
}

function historyOrDefault(history?: ThroughputHistory): ThroughputHistory {
  return history ?? DEFAULT_THROUGHPUT_HISTORY;
}

function isStableHistory(history: ThroughputHistory): boolean {
  return (
    history.recentIncompleteRate < 0.12 &&
    history.recentSuccessRate >= 0.85
  );
}

function isRiskyHistory(history: ThroughputHistory): boolean {
  return history.recentIncompleteRate >= 0.28;
}

/** Paragraph + char budget for translate chunks (adapts to provider + project stats). */
export function resolveAutoChunkBudget(
  providerType: string | null | undefined,
  history?: ThroughputHistory,
): AutoChunkBudget {
  const caps = getProviderCapabilities(providerType);
  const h = historyOrDefault(history);

  if (isBrowserTransport(caps)) {
    let maxSourceChars = caps.hardPromptChars ?? caps.recommendedPromptChars;
    if (isRiskyHistory(h)) {
      maxSourceChars = Math.floor(maxSourceChars * 0.8);
    }
    return {
      maxParagraphs: caps.recommendedParagraphsPerChunk,
      maxSourceChars,
      useBrowserChunking: true,
    };
  }

  let maxParagraphs = WEB_API_PARAGRAPHS_BASE;
  let maxSourceChars = WEB_API_CHARS_BASE;

  if (isStableHistory(h)) {
    maxParagraphs = WEB_API_PARAGRAPHS_BOOST;
    maxSourceChars = WEB_API_CHARS_BOOST;
  } else if (isRiskyHistory(h)) {
    maxParagraphs = WEB_API_PARAGRAPHS_SAFE;
    maxSourceChars = WEB_API_CHARS_SAFE;
  }

  if (h.recentIncompleteRate >= 0.15) {
    maxSourceChars = Math.floor(maxSourceChars * 0.82);
  }
  const ratioHeadroom = h.avgOutputRatio > 1.55 ? 0.88 : 1;
  maxSourceChars = Math.floor(maxSourceChars / ratioHeadroom);

  return {
    maxParagraphs,
    maxSourceChars,
    useBrowserChunking: false,
  };
}

/** Pause between Web API chunks — shorter when project history is clean. */
export function resolveInterChunkDelayMs(
  providerType: string | null | undefined,
  history?: ThroughputHistory,
): number {
  const transport = getProviderCapabilities(providerType).transport;
  if (transport !== 'LOCAL_WORKER') return 0;

  const h = historyOrDefault(history);
  if (isRiskyHistory(h)) return WEB_API_DELAY_SAFE_MS;
  if (isStableHistory(h)) return WEB_API_DELAY_FAST_MS;
  return WEB_API_DELAY_BASE_MS;
}

/** Chapters bundled per translate job (upper bound — batch sizer may shrink). */
export function resolveAutoMaxChaptersPerJob(
  providerType: string | null | undefined,
  history?: ThroughputHistory,
): number {
  const caps = getProviderCapabilities(providerType);
  const h = historyOrDefault(history);
  const base = DEFAULT_MAX_CHAPTERS_PER_JOB;

  if (isBrowserTransport(caps)) {
    return isStableHistory(h) ? Math.max(base, 4) : base;
  }

  if (isStableHistory(h)) return Math.max(base, 5);
  if (isRiskyHistory(h)) return Math.max(2, base - 1);
  return Math.max(base, 4);
}

/** Scale scheduler caps from READY execution targets (AUTO mode only). */
export function resolveAutoConcurrencyCaps(readyWorkerCount: number): {
  autoCap: number;
  perProviderMax: number;
} {
  const ready = Math.max(1, readyWorkerCount);
  const cap = Math.min(HARD_GLOBAL_WORKER_CEILING, ready);
  return { autoCap: cap, perProviderMax: cap };
}

/** Pick thinking model for large Web API chunks when user model is default flash. */
export function pickWebApiModelForChunk(
  configuredModel: string | null | undefined,
  sourceChars: number,
): string | null {
  if (sourceChars < THINKING_SOURCE_CHAR_THRESHOLD) return configuredModel ?? null;
  const model = (configuredModel ?? '').trim().toLowerCase();
  if (!model || model === 'gemini-flash' || model.startsWith('gemini-3.')) {
    return WEB_API_THINKING_MODEL;
  }
  return configuredModel ?? null;
}

/** @deprecated Use resolveAutoChunkBudget — kept for tests referencing legacy names. */
export const LEGACY_WEB_API_PARAGRAPHS = DEFAULT_TRANSLATE_BATCH_PARAGRAPHS;
export const LEGACY_WEB_API_CHARS = WEB_API_MAX_SOURCE_CHARS_PER_CHUNK;
export const LEGACY_PLAYWRIGHT_PARAGRAPHS = PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS;
export const LEGACY_PLAYWRIGHT_CHARS = PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK;
