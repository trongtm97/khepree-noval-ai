import { detectOutputIncomplete } from '../automation/providers/google/generation-lifecycle';
import { ResponseParser } from './response-parser';
import type { RepairParagraph } from './repair-strategies';
import type {
  ParsedBatchResult,
  TranslationLine,
} from '@shared/schemas/output-protocol';
import type { TermDeltaItem } from '@shared/schemas/term-delta';
import type { MemoryDeltaItem } from '@shared/schemas/memory-delta';
import {
  CONTINUATION_REPAIR_THRESHOLD,
  DEFAULT_MAX_CONTINUATION_ATTEMPTS,
} from '@shared/constants/job';
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
} from '@shared/constants/language-profile';
import { formatLanguagePairPreamble } from '@shared/constants/translation-style-model';
import { buildMergedTranslationProtocol } from './translate-chunking';

export { detectOutputIncomplete as isRawOutputIncomplete };

export interface BatchCompleteness {
  incomplete: boolean;
  missingCount: number;
  lastCompleteParagraphId: string | null;
  nextParagraphId: string | null;
  reason: string;
}

export interface ContinuationProgress {
  continuationRound: number;
  lastCompletedParagraphId: string | null;
  phase: 'continuation';
}

export function countMissingParagraphs(
  sourceParagraphIds: string[],
  translatedIds: Set<string>,
): number {
  return sourceParagraphIds.filter((id) => !translatedIds.has(id)).length;
}

export function findLastCompleteParagraphId(
  sourceParagraphIds: string[],
  translations: TranslationLine[],
): string | null {
  const byId = new Map(translations.map((t) => [t.paragraphId, t.text]));
  let last: string | null = null;
  for (const id of sourceParagraphIds) {
    const text = byId.get(id)?.trim();
    if (text) last = id;
  }
  return last;
}

export function nextParagraphAfter(
  sourceParagraphIds: string[],
  afterId: string | null,
): string | null {
  if (!afterId) return sourceParagraphIds[0] ?? null;
  const idx = sourceParagraphIds.indexOf(afterId);
  if (idx < 0) return sourceParagraphIds[0] ?? null;
  return sourceParagraphIds[idx + 1] ?? null;
}

export function assessBatchCompleteness(
  raw: string,
  parsed: ParsedBatchResult,
  sourceParagraphIds: string[],
): BatchCompleteness {
  const translatedIds = new Set(
    parsed.translations.filter((t) => t.text.trim()).map((t) => t.paragraphId),
  );
  const missingCount = countMissingParagraphs(sourceParagraphIds, translatedIds);
  const lastCompleteParagraphId = findLastCompleteParagraphId(
    sourceParagraphIds,
    parsed.translations,
  );
  const nextParagraphId = nextParagraphAfter(sourceParagraphIds, lastCompleteParagraphId);

  const rawIncomplete = detectOutputIncomplete(raw);
  const incomplete =
    rawIncomplete ||
    (missingCount > 0 && parsed.translations.some((t) => t.text.trim()));

  let reason = 'complete';
  if (rawIncomplete) reason = 'OUTPUT_INCOMPLETE';
  else if (missingCount > 0) reason = 'MISSING_TAIL';

  return {
    incomplete,
    missingCount,
    lastCompleteParagraphId,
    nextParagraphId,
    reason,
  };
}

/** Large tail gaps → continuation; small gaps → per-paragraph repair. */
export function shouldUseContinuation(missingCount: number): boolean {
  return missingCount > CONTINUATION_REPAIR_THRESHOLD;
}

export function shouldUseRepairForMissing(missingCount: number): boolean {
  return missingCount > 0 && missingCount <= CONTINUATION_REPAIR_THRESHOLD;
}

export function buildContinuationPrompt(input: {
  fromParagraphId: string;
  batchParagraphs: RepairParagraph[];
  remainingParagraphIds: string[];
  sourceLanguage?: string;
  targetLanguage?: string;
}): string {
  const remaining = new Set(input.remainingParagraphIds);
  const sourceBlock = input.batchParagraphs
    .filter((p) => remaining.has(p.paragraphId))
    .map((p) => `${p.paragraphId} ${p.sourceText}`)
    .join('\n');

  return [
    formatLanguagePairPreamble(
      input.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE,
      input.targetLanguage ?? DEFAULT_TARGET_LANGUAGE,
    ),
    '',
    `Continue from ${input.fromParagraphId}.`,
    'Do not repeat paragraphs already translated.',
    'Return only the remaining part.',
    'Keep protocol: <TRANSLATION>, <TERM_DELTA>, <MEMORY_DELTA> with full closing tags.',
    'Do not renumber paragraph IDs — use exact source IDs.',
    'Translations must be in the target language.',
    '',
    'Source paragraphs (remaining):',
    sourceBlock,
  ].join('\n');
}

/** Merge by paragraph ID; first occurrence wins (dedupe continuation repeats). */
export function mergeTranslationsByParagraphId(
  base: TranslationLine[],
  extra: TranslationLine[],
  sourceOrder: string[],
): TranslationLine[] {
  return mergeTranslationsByParagraphIdWithPreference(base, extra, sourceOrder, 'first');
}

/** Partial repair: newer lines override existing ones for the same paragraph ID. */
export function mergeRepairTranslations(
  base: TranslationLine[],
  extra: TranslationLine[],
  sourceOrder: string[],
): TranslationLine[] {
  return mergeTranslationsByParagraphIdWithPreference(base, extra, sourceOrder, 'last');
}

function mergeTranslationsByParagraphIdWithPreference(
  base: TranslationLine[],
  extra: TranslationLine[],
  sourceOrder: string[],
  prefer: 'first' | 'last',
): TranslationLine[] {
  const orderedLines = prefer === 'first' ? [...base, ...extra] : [...extra, ...base];
  const map = new Map<string, TranslationLine>();
  for (const line of orderedLines) {
    if (!line.text.trim()) continue;
    if (!map.has(line.paragraphId)) {
      map.set(line.paragraphId, line);
    }
  }
  const ordered: TranslationLine[] = [];
  for (const id of sourceOrder) {
    const line = map.get(id);
    if (line) ordered.push(line);
  }
  for (const line of map.values()) {
    if (!sourceOrder.includes(line.paragraphId)) ordered.push(line);
  }
  return ordered;
}

export function dedupeTranslationLines(lines: TranslationLine[]): TranslationLine[] {
  const seen = new Set<string>();
  const out: TranslationLine[] = [];
  for (const line of lines) {
    if (!line.text.trim()) continue;
    if (seen.has(line.paragraphId)) continue;
    seen.add(line.paragraphId);
    out.push(line);
  }
  return out;
}

export function mergeDeltaArrays<T>(base: T[], extra: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...base, ...extra]) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export interface ContinuationSendResult {
  text: string;
  requestId: string;
  status: string;
}

export type ContinuationSender = (
  prompt: string,
  requestId: string,
) => Promise<ContinuationSendResult>;

export interface ContinuationLoopInput {
  batchParagraphs: RepairParagraph[];
  sourceParagraphIds: string[];
  initialRaw: string;
  maxAttempts?: number;
  sendContinuation: ContinuationSender;
  persistPartial?: (raw: string, meta: { round: number; label: string }) => void;
  onProgress?: (progress: ContinuationProgress) => void;
  parser?: ResponseParser;
}

export interface ContinuationLoopResult {
  rawResponse: string;
  continuationRounds: number;
  translations: TranslationLine[];
  termDeltas: TermDeltaItem[];
  memoryDeltas: MemoryDeltaItem[];
  completeness: BatchCompleteness;
}

/**
 * Extend a partial batch response via CONTINUATION prompts (no full re-translate).
 */
export async function runContinuationLoop(
  input: ContinuationLoopInput,
): Promise<ContinuationLoopResult> {
  const parser = input.parser ?? new ResponseParser();
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_CONTINUATION_ATTEMPTS;

  let raw = input.initialRaw;
  let parsed = parser.parse(raw);
  let completeness = assessBatchCompleteness(raw, parsed, input.sourceParagraphIds);
  let continuationRounds = 0;

  let translations = dedupeTranslationLines(parsed.translations);
  let termDeltas = [...parsed.termDeltas];
  let memoryDeltas = [...parsed.memoryDeltas];

  input.persistPartial?.(raw, { round: 0, label: 'initial' });

  while (
    completeness.incomplete &&
    completeness.missingCount > 0 &&
    translations.some((t) => t.text.trim()) &&
    continuationRounds < maxAttempts
  ) {
    if (!shouldUseContinuation(completeness.missingCount) && !detectOutputIncomplete(raw)) {
      break;
    }

    const fromId =
      completeness.nextParagraphId ??
      nextParagraphAfter(input.sourceParagraphIds, completeness.lastCompleteParagraphId);
    if (!fromId) break;

    const remainingIds = input.sourceParagraphIds.filter(
      (id) => !translations.some((t) => t.paragraphId === id && t.text.trim()),
    );
    if (remainingIds.length === 0) break;

    continuationRounds += 1;
    input.onProgress?.({
      continuationRound: continuationRounds,
      lastCompletedParagraphId: completeness.lastCompleteParagraphId,
      phase: 'continuation',
    });

    const prompt = buildContinuationPrompt({
      fromParagraphId: fromId,
      batchParagraphs: input.batchParagraphs,
      remainingParagraphIds: remainingIds,
    });

    const sent = await input.sendContinuation(prompt, `cont-${continuationRounds}`);
    if (sent.status !== 'SUCCESS' || !sent.text.trim()) {
      break;
    }

    raw = appendRawSegments(raw, sent.text);
    input.persistPartial?.(raw, { round: continuationRounds, label: 'continuation' });

    const contParsed = parser.parse(sent.text);
    translations = mergeTranslationsByParagraphId(
      translations,
      dedupeTranslationLines(contParsed.translations),
      input.sourceParagraphIds,
    );
    termDeltas = mergeDeltaArrays(termDeltas, contParsed.termDeltas, termDeltaKey);
    memoryDeltas = mergeDeltaArrays(memoryDeltas, contParsed.memoryDeltas, memoryDeltaKey);

    parsed = {
      ...parsed,
      translations,
      termDeltas,
      memoryDeltas,
      status: 'recovered',
      recoveryUsed: true,
    };
    completeness = assessBatchCompleteness(
      buildMergedTranslationProtocol(translations, termDeltas, memoryDeltas),
      parsed,
      input.sourceParagraphIds,
    );
  }

  const mergedRaw = buildMergedTranslationProtocol(translations, termDeltas, memoryDeltas);
  return {
    rawResponse: mergedRaw,
    continuationRounds,
    translations,
    termDeltas,
    memoryDeltas,
    completeness: assessBatchCompleteness(mergedRaw, parsed, input.sourceParagraphIds),
  };
}

function appendRawSegments(base: string, segment: string): string {
  return `${base.trim()}\n\n--- CONTINUATION ---\n${segment.trim()}`;
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
