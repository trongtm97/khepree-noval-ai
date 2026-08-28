import type { RepairPack } from '@shared/schemas/output-protocol';
import { formatLanguagePairPreamble } from '@shared/constants/translation-style-model';
import type { RepairNeighborTranslation } from './repair-translation-context';
import { requireRepairLanguagePair } from './repair-language-pair';

export interface RepairParagraphInput {
  paragraphId: string;
  sourceText: string;
}

export interface BuildRepairPackInput {
  missingParagraphIds: string[];
  /** Full batch paragraphs in order (for context neighbors). */
  batchParagraphs: RepairParagraphInput[];
  /** How many neighbors on each side of a missing block (default 1). */
  contextRadius?: number;
  sourceLanguage: string;
  targetLanguage: string;
  /** Already-approved target lines for neighbor paragraphs (pronoun/tone continuity). */
  neighborTargetTranslations?: RepairNeighborTranslation[];
}

/**
 * Build a minimal repair prompt — ONLY missing paragraphs + local context.
 * Never re-sends the full chapter.
 */
export function buildRepairPack(input: BuildRepairPackInput): RepairPack {
  const languages = requireRepairLanguagePair(input);

  const missingSet = new Set(input.missingParagraphIds);
  if (missingSet.size === 0) {
    throw new Error('buildRepairPack requires at least one missing paragraph ID');
  }

  const byId = new Map(input.batchParagraphs.map((p) => [p.paragraphId, p]));
  const paragraphs: RepairParagraphInput[] = [];
  for (const id of input.missingParagraphIds) {
    const para = byId.get(id);
    if (!para) {
      throw new Error(`Missing paragraph not in batch: ${id}`);
    }
    paragraphs.push(para);
  }

  const radius = input.contextRadius ?? 1;
  const contextParagraphs = collectSourceNeighbors(
    input.batchParagraphs,
    missingSet,
    radius,
  );
  const neighborTargets =
    input.neighborTargetTranslations ??
    [];

  const prompt = renderRepairPrompt(paragraphs, contextParagraphs, neighborTargets, languages);

  return {
    missingParagraphIds: [...input.missingParagraphIds],
    paragraphs,
    contextParagraphs,
    prompt,
  };
}

function collectSourceNeighbors(
  batch: RepairParagraphInput[],
  missing: Set<string>,
  radius: number,
): RepairParagraphInput[] {
  const missingIndices = batch
    .map((p, i) => (missing.has(p.paragraphId) ? i : -1))
    .filter((i) => i >= 0);

  const include = new Set<number>();
  for (const i of missingIndices) {
    for (let d = -radius; d <= radius; d += 1) {
      const j = i + d;
      if (j < 0 || j >= batch.length) continue;
      include.add(j);
    }
  }

  return batch.filter(
    (p, i) => include.has(i) && !missing.has(p.paragraphId),
  );
}

function renderRepairPrompt(
  missing: RepairParagraphInput[],
  sourceNeighbors: RepairParagraphInput[],
  neighborTargets: RepairNeighborTranslation[],
  languages: { sourceLanguage: string; targetLanguage: string },
): string {
  const missingList = missing.map((p) => p.paragraphId).join('\n');
  const targetNeighborBlock =
    neighborTargets.length === 0
      ? null
      : [
          '### Previous translated context',
          ...neighborTargets.map((t) => `${t.paragraphId} ${t.targetText}`),
        ].join('\n');
  const sourceNeighborBlock =
    sourceNeighbors.length === 0
      ? null
      : [
          '### Neighbor source (context only — do NOT re-translate)',
          ...sourceNeighbors.map((p) => `${p.paragraphId} ${p.sourceText}`),
        ].join('\n');
  const missingBlock = [
    '### Missing source',
    ...missing.map((p) => `${p.paragraphId} ${p.sourceText}`),
  ].join('\n');

  return [
    formatLanguagePairPreamble(languages.sourceLanguage, languages.targetLanguage),
    '',
    'Previous response was missing translations for these paragraph IDs:',
    missingList,
    '',
    targetNeighborBlock,
    targetNeighborBlock ? '' : null,
    sourceNeighborBlock,
    sourceNeighborBlock ? '' : null,
    missingBlock,
    '',
    'Translate ONLY the missing source paragraphs listed above.',
    'Output ONLY the <TRANSLATION> section for those IDs.',
    'Use exact IDs. One physical line per ID. No TERM_DELTA or MEMORY_DELTA.',
    'No markdown fences. Do not re-translate neighbor or previous-context lines.',
    '',
    '<TRANSLATION>',
    '[C000001:P000001] TARGET_LANGUAGE_TRANSLATION...',
    '</TRANSLATION>',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
