import { describe, expect, it } from 'vitest';
import type { EditorParagraphDto } from '../../../src/shared/schemas/translation-editor';
import {
  countQaParagraphs,
  findNextQaParagraphIndex,
  isChapterFullyTranslated,
  resolveTitleParagraphIndex,
  splitRatioToSourceFr,
} from '../../../src/renderer/utils/editor-chapter-utils';

function makeParagraph(overrides: Partial<EditorParagraphDto> = {}): EditorParagraphDto {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    stableParagraphId: '[C000001:P000001]',
    sequence: 1,
    sourceText: '第一章',
    translationId: null,
    translatedText: null,
    status: 'draft',
    versionSource: 'AI_INITIAL',
    humanLocked: false,
    qaWarnings: [],
    termHighlights: [],
    ...overrides,
  };
}

describe('editor-chapter-utils', () => {
  it('maps split ratio to source fr units', () => {
    expect(splitRatioToSourceFr(0.48)).toBeCloseTo(0.923, 2);
  });

  it('detects title paragraph index from chapter title', () => {
    const paragraphs = [
      makeParagraph({ sourceText: '青云门' }),
      makeParagraph({ stableParagraphId: '[C000001:P000002]', sequence: 2, sourceText: '正文' }),
    ];
    expect(resolveTitleParagraphIndex(paragraphs, '青云门')).toBe(0);
  });

  it('counts QA paragraphs and cycles next index', () => {
    const paragraphs = [
      makeParagraph(),
      makeParagraph({
        stableParagraphId: '[C000001:P000002]',
        sequence: 2,
        status: 'qa_warning',
        qaWarnings: ['length'],
      }),
      makeParagraph({
        stableParagraphId: '[C000001:P000003]',
        sequence: 3,
        qaWarnings: ['term'],
      }),
    ];
    expect(countQaParagraphs(paragraphs)).toBe(2);
    expect(findNextQaParagraphIndex(paragraphs, -1)).toBe(1);
    expect(findNextQaParagraphIndex(paragraphs, 1)).toBe(2);
    expect(findNextQaParagraphIndex(paragraphs, 2)).toBe(1);
  });

  it('treats chapter as translated when every paragraph has text or lock', () => {
    const paragraphs = [
      makeParagraph({ translatedText: 'Một' }),
      makeParagraph({
        stableParagraphId: '[C000001:P000002]',
        sequence: 2,
        translatedText: null,
        humanLocked: true,
      }),
    ];
    expect(isChapterFullyTranslated(paragraphs, {})).toBe(true);
    expect(
      isChapterFullyTranslated(
        [makeParagraph({ translatedText: null })],
        {},
      ),
    ).toBe(false);
  });
});
