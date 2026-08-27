import { describe, expect, it, vi } from 'vitest';
import { ResponseParser } from '../../../src/main/jobs/response-parser';
import {
  assessBatchCompleteness,
  buildContinuationPrompt,
  dedupeTranslationLines,
  findLastCompleteParagraphId,
  mergeTranslationsByParagraphId,
  runContinuationLoop,
  shouldUseContinuation,
  shouldUseRepairForMissing,
} from '../../../src/main/jobs/continuation';
import { detectOutputIncomplete } from '../../../src/main/automation/providers/google/generation-lifecycle';

const IDS = Array.from(
  { length: 10 },
  (_, i) => `[C000001:P${String(i + 1).padStart(6, '0')}]`,
);

function partialProtocol(untilIndex: number): string {
  const lines = IDS.slice(0, untilIndex + 1).map(
    (id, i) => `${id} Đoạn ${i + 1}.`,
  );
  return [
    '<TRANSLATION>',
    ...lines,
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

function cutAfter30Percent(): string {
  const cutAt = Math.max(1, Math.floor(IDS.length * 0.3));
  const lines = IDS.slice(0, cutAt).map((id, i) => `${id} Đoạn ${i + 1}.`);
  return ['<TRANSLATION>', ...lines].join('\n');
}

function cutAfter90Percent(): string {
  const cutAt = Math.max(1, Math.floor(IDS.length * 0.9));
  const lines = IDS.slice(0, cutAt).map((id, i) => `${id} Đoạn ${i + 1}.`);
  return ['<TRANSLATION>', ...lines].join('\n');
}

describe('continuation', () => {
  const batchParagraphs = IDS.map((id, i) => ({
    paragraphId: id,
    sourceText: `源${i + 1}`,
  }));

  it('detectOutputIncomplete flags malformed end tags', () => {
    expect(detectOutputIncomplete(cutAfter30Percent())).toBe(true);
    expect(detectOutputIncomplete(partialProtocol(2))).toBe(false);
  });

  it('assessBatchCompleteness at ~30% cut marks incomplete with tail missing', () => {
    const raw = cutAfter30Percent();
    const parsed = new ResponseParser().parse(raw);
    const result = assessBatchCompleteness(raw, parsed, IDS);
    expect(result.incomplete).toBe(true);
    expect(result.missingCount).toBeGreaterThan(5);
    expect(shouldUseContinuation(result.missingCount)).toBe(true);
  });

  it('assessBatchCompleteness at ~90% cut prefers continuation over repair', () => {
    const raw = cutAfter90Percent();
    const parsed = new ResponseParser().parse(raw);
    const result = assessBatchCompleteness(raw, parsed, IDS);
    expect(result.incomplete).toBe(true);
    expect(result.missingCount).toBeGreaterThan(0);
    expect(result.missingCount).toBeLessThanOrEqual(2);
    expect(shouldUseRepairForMissing(result.missingCount)).toBe(true);
    expect(shouldUseContinuation(result.missingCount)).toBe(false);
  });

  it('findLastCompleteParagraphId walks source order', () => {
    const parsed = new ResponseParser().parse(partialProtocol(2));
    expect(findLastCompleteParagraphId(IDS, parsed.translations)).toBe(IDS[2]);
  });

  it('buildContinuationPrompt asks to continue without repeating', () => {
    const prompt = buildContinuationPrompt({
      fromParagraphId: IDS[3]!,
      batchParagraphs,
      remainingParagraphIds: IDS.slice(3),
    });
    expect(prompt).toContain(`Tiếp tục từ ${IDS[3]}`);
    expect(prompt).toContain('Không lặp lại');
    expect(prompt).toContain(IDS[3]!);
  });

  it('mergeTranslationsByParagraphId dedupes duplicate continuation', () => {
    const base = [{ paragraphId: IDS[0]!, text: 'Một.' }];
    const extra = [
      { paragraphId: IDS[0]!, text: 'Một lặp.' },
      { paragraphId: IDS[1]!, text: 'Hai.' },
    ];
    const merged = mergeTranslationsByParagraphId(base, extra, IDS);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.text).toBe('Một.');
    expect(merged[1]?.text).toBe('Hai.');
  });

  it('dedupeTranslationLines keeps first paragraph id', () => {
    const out = dedupeTranslationLines([
      { paragraphId: IDS[0]!, text: 'A' },
      { paragraphId: IDS[0]!, text: 'B' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe('A');
  });

  it('runContinuationLoop merges tail without re-translating head', async () => {
    const initialRaw = partialProtocol(2);
    let sends = 0;
    const persistPartial = vi.fn();

    const result = await runContinuationLoop({
      batchParagraphs,
      sourceParagraphIds: IDS,
      initialRaw,
      maxAttempts: 2,
      persistPartial,
      sendContinuation: async () => {
        sends += 1;
        return {
          status: 'SUCCESS',
          requestId: `r${sends}`,
          text: partialProtocol(IDS.length - 1),
        };
      },
    });

    expect(sends).toBe(1);
    expect(persistPartial).toHaveBeenCalled();
    expect(result.translations.length).toBe(IDS.length);
    expect(result.completeness.missingCount).toBe(0);
  });

  it('runContinuationLoop tolerates model restart numbering via paragraph IDs', async () => {
    const initialRaw = partialProtocol(1);
    const restartedId = '[C000001:P000001]';
    const result = await runContinuationLoop({
      batchParagraphs,
      sourceParagraphIds: IDS,
      initialRaw,
      maxAttempts: 1,
      sendContinuation: async () => ({
        status: 'SUCCESS',
        requestId: 'r1',
        text: [
          '<TRANSLATION>',
          `${restartedId} Lặp đầu.`,
          `${IDS[2]!} Ba.`,
          `${IDS[3]!} Bốn.`,
          '</TRANSLATION>',
          '<TERM_DELTA>[]</TERM_DELTA>',
          '<MEMORY_DELTA>[]</MEMORY_DELTA>',
        ].join('\n'),
      }),
    });
    expect(result.translations.find((t) => t.paragraphId === IDS[0])?.text).toBe(
      'Đoạn 1.',
    );
    expect(result.translations.some((t) => t.paragraphId === IDS[2])).toBe(true);
  });

  it('runContinuationLoop stops after max continuation attempts', async () => {
    const initialRaw = cutAfter30Percent();
    let sends = 0;
    const result = await runContinuationLoop({
      batchParagraphs,
      sourceParagraphIds: IDS,
      initialRaw,
      maxAttempts: 2,
      sendContinuation: async () => {
        sends += 1;
        return { status: 'SUCCESS', requestId: `r${sends}`, text: cutAfter30Percent() };
      },
    });
    expect(sends).toBe(2);
    expect(result.continuationRounds).toBe(2);
    expect(result.completeness.missingCount).toBeGreaterThan(0);
  });
});
