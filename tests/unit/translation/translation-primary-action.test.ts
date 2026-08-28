import { describe, expect, it } from 'vitest';
import type { ChapterSummaryDto } from '../../../src/shared/schemas/translation-pack';
import type { JobDto } from '../../../src/shared/schemas/job';
import { resolvePrimaryTranslateAction } from '../../../src/renderer/utils/translation-primary-action';

function makeChapter(n: number, hasTranslation = false): ChapterSummaryDto {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    chapterNumber: n,
    sequenceOrder: n,
    title: null,
    characterCount: 80,
    paragraphCount: 8,
    status: 'ready',
    hasTranslation,
    sourceStatus: 'SOURCE_READY',
  };
}

describe('resolvePrimaryTranslateAction', () => {
  it('labels untranslated current chapter', () => {
    const chapters = [makeChapter(1, true), makeChapter(2, false), makeChapter(3, false)];
    const result = resolvePrimaryTranslateAction({
      chapters,
      chapterIndex: 1,
      nextUntranslatedChapter: 2,
      activeJob: null,
      preparing: false,
      busy: false,
    });
    expect(result.labelKey).toBe('translation.translateChapterN');
    expect(result.labelParams).toEqual({ n: '2' });
  });

  it('labels continue to next untranslated chapter', () => {
    const chapters = [makeChapter(1, true), makeChapter(2, true), makeChapter(3, false)];
    const result = resolvePrimaryTranslateAction({
      chapters,
      chapterIndex: 1,
      nextUntranslatedChapter: 3,
      activeJob: null,
      preparing: false,
      busy: false,
    });
    expect(result.labelKey).toBe('translation.continueNextChapter');
    expect(result.labelParams).toEqual({ n: '3' });
  });

  it('shows resume when job paused', () => {
    const result = resolvePrimaryTranslateAction({
      chapters: [makeChapter(1)],
      chapterIndex: 0,
      activeJob: { state: 'PAUSED' } as JobDto,
      preparing: false,
      busy: false,
    });
    expect(result.labelKey).toBe('actions.resume');
    expect(result.primaryHandler).toBe('resume');
  });

  it('disables with translating label when job running', () => {
    const result = resolvePrimaryTranslateAction({
      chapters: [makeChapter(1)],
      chapterIndex: 0,
      activeJob: { state: 'RUNNING', chapterFrom: 1, chapterTo: 1 } as JobDto,
      preparing: false,
      busy: false,
    });
    expect(result.labelKey).toBe('translation.translatingAction');
    expect(result.disabled).toBe(true);
    expect(result.loading).toBe(true);
  });

  it('marks project complete when no untranslated chapters remain', () => {
    const chapters = [makeChapter(1, true), makeChapter(2, true)];
    const result = resolvePrimaryTranslateAction({
      chapters,
      chapterIndex: 1,
      nextUntranslatedChapter: null,
      activeJob: null,
      preparing: false,
      busy: false,
    });
    expect(result.labelKey).toBe('dashboard.translationComplete');
    expect(result.disabled).toBe(true);
  });
});
