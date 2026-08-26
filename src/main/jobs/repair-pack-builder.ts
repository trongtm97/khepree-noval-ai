import type { RepairPack } from '@shared/schemas/output-protocol';

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
}

/**
 * Build a minimal repair prompt — ONLY missing paragraphs + local context.
 * Never re-sends the full chapter.
 */
export function buildRepairPack(input: BuildRepairPackInput): RepairPack {
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
  const contextParagraphs = collectContext(
    input.batchParagraphs,
    missingSet,
    radius,
  );

  const prompt = renderRepairPrompt(paragraphs, contextParagraphs);

  return {
    missingParagraphIds: [...input.missingParagraphIds],
    paragraphs,
    contextParagraphs,
    prompt,
  };
}

function collectContext(
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
  context: RepairParagraphInput[],
): string {
  const missingList = missing.map((p) => p.paragraphId).join('\n');
  const contextBlock =
    context.length === 0
      ? '(none)'
      : context.map((p) => `${p.paragraphId} ${p.sourceText}`).join('\n');
  const sourceBlock = missing.map((p) => `${p.paragraphId} ${p.sourceText}`).join('\n');

  return [
    'Previous response was missing translations for these paragraph IDs:',
    missingList,
    '',
    'Local context (already translated — do NOT re-translate unless listed above):',
    contextBlock,
    '',
    'Translate ONLY these source paragraphs:',
    sourceBlock,
    '',
    'Output ONLY the <TRANSLATION> section for the missing IDs.',
    'Use exact IDs. One line per ID. No other sections. No markdown fences.',
    '',
    '<TRANSLATION>',
    '[C000001:P000001] …',
    '</TRANSLATION>',
  ].join('\n');
}
