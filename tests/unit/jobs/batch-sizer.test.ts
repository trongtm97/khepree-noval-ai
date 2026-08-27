import { describe, expect, it } from 'vitest';
import {
  computeSourceCharacters,
  planChapterBatches,
  type ChapterBatchInput,
} from '../../../src/main/jobs/batch-sizer';
import { PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK } from '../../../src/shared/constants/job';

function chapter(
  ref: number,
  id: string,
  charCount: number,
  paragraphCount = 1,
): ChapterBatchInput {
  const batchParagraphs = Array.from({ length: paragraphCount }, (_, i) => ({
    paragraphId: `[C${String(ref).padStart(6, '0')}:P${String(i + 1).padStart(6, '0')}]`,
    sourceText: 'x'.repeat(Math.ceil(charCount / paragraphCount)),
  }));
  return { chapterId: id, chapterRef: ref, batchParagraphs };
}

describe('batch-sizer', () => {
  it('keeps small multi-chapter batch when under char budget', () => {
    const chapters = [
      chapter(1, 'c1', 5000),
      chapter(2, 'c2', 5000),
      chapter(3, 'c3', 5000),
    ];
    const plans = planChapterBatches(chapters, {
      maxChaptersUser: 3,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.chosenChapterCount).toBe(3);
  });

  it('shrinks maxChapters=3 to 1 when combined source exceeds budget', () => {
    const perChapter = Math.floor(PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK / 2) + 5000;
    const chapters = [
      chapter(1, 'c1', perChapter),
      chapter(2, 'c2', perChapter),
      chapter(3, 'c3', perChapter),
    ];
    const plans = planChapterBatches(chapters, {
      maxChaptersUser: 3,
      providerType: 'PLAYWRIGHT_GEMINI',
    });
    expect(plans.length).toBeGreaterThan(1);
    expect(plans.every((p) => p.chosenChapterCount <= 3)).toBe(true);
    expect(plans.some((p) => p.chosenChapterCount === 1)).toBe(true);
    expect(plans[0]?.reason).toMatch(/Giảm|giới hạn/i);
  });

  it('lowers char budget when recent incomplete rate is high', () => {
    const chapters = [
      chapter(1, 'c1', 20_000),
      chapter(2, 'c2', 20_000),
    ];
    const stable = planChapterBatches(chapters, {
      maxChaptersUser: 2,
      providerType: 'PLAYWRIGHT_GEMINI',
      history: { avgOutputRatio: 1.2, recentIncompleteRate: 0, recentSuccessRate: 1 },
    });
    const cautious = planChapterBatches(chapters, {
      maxChaptersUser: 2,
      providerType: 'PLAYWRIGHT_GEMINI',
      history: { avgOutputRatio: 1.2, recentIncompleteRate: 0.4, recentSuccessRate: 0.6 },
    });
    expect(stable[0]?.chosenChapterCount).toBeGreaterThanOrEqual(
      cautious[0]?.chosenChapterCount ?? 0,
    );
  });

  it('computeSourceCharacters sums paragraph text', () => {
    const chars = computeSourceCharacters([
      { paragraphId: '[C000001:P000001]', sourceText: 'abc' },
      { paragraphId: '[C000001:P000002]', sourceText: 'defghij' },
    ]);
    expect(chars).toBe(10);
  });
});
