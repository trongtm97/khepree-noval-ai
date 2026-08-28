import { describe, expect, it } from 'vitest';
import type { ChapterSummaryDto } from '../../../src/shared/schemas/translation-pack';
import type { JobDto } from '../../../src/shared/schemas/job';
import {
  chapterMatchesSearch,
  currentChapterCountLabel,
  filterChapterEntries,
  findNextIssueIndex,
  findNextUntranslatedIndex,
  translatingNumbersFromJob,
} from '../../../src/renderer/utils/chapter-navigator';

function uuidFor(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function makeChapter(n: number, overrides: Partial<ChapterSummaryDto> = {}): ChapterSummaryDto {
  return {
    id: uuidFor(n),
    chapterNumber: n,
    sequenceOrder: n,
    title: n % 17 === 0 ? `Title ${n}` : null,
    characterCount: 100,
    paragraphCount: 10,
    status: 'ready',
    hasTranslation: n % 3 === 0,
    sourceStatus: n % 23 === 0 ? 'SOURCE_MODIFIED' : 'SOURCE_READY',
    ...overrides,
  };
}

function makeChapters(count: number): ChapterSummaryDto[] {
  const list: ChapterSummaryDto[] = [];
  for (let n = 1; n <= count; n += 1) list.push(makeChapter(n));
  return list;
}

describe('chapter-navigator helpers', () => {
  it.each([184, 2000, 10_000])('filters %s chapters by number, title, and status', (count) => {
    const chapters = makeChapters(count);
    const start = performance.now();
    const byNumber = filterChapterEntries(chapters, '15', 'all', new Set());
    const untranslated = filterChapterEntries(chapters, '', 'untranslated', new Set());
    const elapsed = performance.now() - start;
    expect(byNumber.some((e) => e.ch.chapterNumber === 15)).toBe(true);
    expect(untranslated.every((e) => e.status === 'untranslated')).toBe(true);
    expect(elapsed).toBeLessThan(80);
  });

  it('matches search on number and title', () => {
    const ch = makeChapter(42, { title: 'Thanh Vân' });
    expect(chapterMatchesSearch(ch, '42')).toBe(true);
    expect(chapterMatchesSearch(ch, 'thanh')).toBe(true);
    expect(chapterMatchesSearch(ch, 'zzz')).toBe(false);
  });

  it('finds next untranslated and next issue without staying on current', () => {
    const chapters = [
      makeChapter(1, { hasTranslation: true, sourceStatus: 'SOURCE_READY' }),
      makeChapter(2, { hasTranslation: false, sourceStatus: 'SOURCE_READY' }),
      makeChapter(3, { hasTranslation: true, sourceStatus: 'SOURCE_CONFLICT' }),
    ];
    expect(findNextUntranslatedIndex(chapters, 0, new Set())).toBe(1);
    expect(findNextIssueIndex(chapters, 0, new Set())).toBe(2);
    expect(findNextUntranslatedIndex(chapters, 1, new Set())).toBeNull();
  });

  it('builds translating numbers from an active job only', () => {
    const job = {
      state: 'RUNNING',
      chapterFrom: 16,
      chapterTo: 18,
    } as JobDto;
    const set = translatingNumbersFromJob(job);
    expect([...set]).toEqual([16, 17, 18]);
    expect(translatingNumbersFromJob({ ...job, state: 'COMPLETED' })).toEqual(new Set());
  });

  it('labels current / total from chapter number', () => {
    const chapters = makeChapters(184);
    expect(currentChapterCountLabel(chapters, 14)).toEqual({ current: '15', total: '184' });
  });
});
