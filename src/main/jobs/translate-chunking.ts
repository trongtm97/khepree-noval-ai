import {
  DEFAULT_TRANSLATE_BATCH_PARAGRAPHS,
  PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK,
  PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS,
} from '@shared/constants/job';
import type { TermDeltaItem } from '@shared/schemas/term-delta';
import type { MemoryDeltaItem } from '@shared/schemas/memory-delta';

export function chunkParagraphBatch<T>(
  items: T[],
  batchSize = DEFAULT_TRANSLATE_BATCH_PARAGRAPHS,
): T[][] {
  if (items.length === 0) return [];
  if (items.length <= batchSize) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    chunks.push(items.slice(i, i + batchSize));
  }
  return chunks;
}

/** Web API stays small; Playwright providers use a larger paragraph batch. */
export function resolveTranslateBatchParagraphs(
  firstProviderType: string | null | undefined,
): number {
  if (
    firstProviderType === 'PLAYWRIGHT_GEMINI' ||
    firstProviderType === 'PLAYWRIGHT_CHATGPT' ||
    firstProviderType === 'PLAYWRIGHT_META_AI'
  ) {
    return PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS;
  }
  return DEFAULT_TRANSLATE_BATCH_PARAGRAPHS;
}

/** Playwright: respect paragraph cap AND source char cap (large chapter → multiple sends). */
export function chunkParagraphBatchForPlaywright<T extends { sourceText?: string }>(
  items: T[],
  maxParagraphs = PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS,
  maxSourceChars = PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK,
): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  let current: T[] = [];
  let charSum = 0;

  for (const item of items) {
    const len = item.sourceText?.length ?? 0;
    const overflow =
      current.length > 0 &&
      (current.length >= maxParagraphs || charSum + len > maxSourceChars);
    if (overflow) {
      chunks.push(current);
      current = [];
      charSum = 0;
    }
    current.push(item);
    charSum += len;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Halve a failing chunk for soft-error / SERVICE_UNAVAILABLE recovery. */
export function splitParagraphChunkInHalf<T>(items: T[]): [T[], T[]] | null {
  if (items.length < 2) return null;
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

function termDeltaKey(item: TermDeltaItem): string {
  return `${item.action}|${item.source}|${item.target}`;
}

function memoryDeltaKey(item: MemoryDeltaItem): string {
  if (item.action === 'upsert' || item.action === 'delete') {
    return `${item.action}|${item.category}|${item.key}`;
  }
  if (item.action === 'relationship') {
    return `relationship|${item.from}|${item.to}|${item.type}`;
  }
  return `story_state|${item.currentChapterNumber ?? ''}|${item.summaryText ?? ''}`;
}

/** Dedupe while preserving first-seen order across chunks. */
export function mergeTermDeltas(chunks: TermDeltaItem[][]): TermDeltaItem[] {
  const seen = new Set<string>();
  const out: TermDeltaItem[] = [];
  for (const list of chunks) {
    for (const item of list) {
      const key = termDeltaKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function mergeMemoryDeltas(chunks: MemoryDeltaItem[][]): MemoryDeltaItem[] {
  const seen = new Set<string>();
  const out: MemoryDeltaItem[] = [];
  for (const list of chunks) {
    for (const item of list) {
      const key = memoryDeltaKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** Build a protocol body from merged chunk translations + accumulated deltas. */
export function buildMergedTranslationProtocol(
  lines: { paragraphId: string; text: string }[],
  termDeltas: TermDeltaItem[] = [],
  memoryDeltas: MemoryDeltaItem[] = [],
): string {
  const body = lines.map((l) => `${l.paragraphId} ${l.text}`).join('\n');
  return [
    '<TRANSLATION>',
    body,
    '</TRANSLATION>',
    `<TERM_DELTA>${JSON.stringify(termDeltas)}</TERM_DELTA>`,
    `<MEMORY_DELTA>${JSON.stringify(memoryDeltas)}</MEMORY_DELTA>`,
  ].join('\n');
}
