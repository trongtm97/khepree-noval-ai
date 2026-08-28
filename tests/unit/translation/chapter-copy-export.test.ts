import { describe, expect, it } from 'vitest';
import {
  buildChapterPlainText,
  chapterHasTranslatableContent,
  formatExportChapterHeading,
} from '../../../src/shared/utils/chapter-export-text';
import { buildChapterExportFilename, sanitizeFilename } from '../../../src/shared/utils/sanitize-filename';
import { canCopyChapter } from '../../../src/renderer/services/chapter-clipboard-service';

const sampleParagraphs = [
  {
    stableParagraphId: '[C000451:P000001]',
    sourceText: '一段。',
    translatedText: 'Đoạn một.',
  },
  {
    stableParagraphId: '[C000451:P000002]',
    sourceText: '二段。',
    translatedText: null,
  },
];

describe('chapter-export-text', () => {
  it('builds translation-only text with title and blank lines', () => {
    const text = buildChapterPlainText(451, 'Hành trình', sampleParagraphs, 'translation');
    expect(text).toBe('Chương 451: Hành trình\n\nĐoạn một.');
  });

  it('uses draft text for unsaved editor state', () => {
    const withDraft = [
      { ...sampleParagraphs[0], draftText: 'Bản nháp.' },
      sampleParagraphs[1],
    ];
    const text = buildChapterPlainText(451, 'Ch', withDraft, 'translation', {
      includeTitle: false,
    });
    expect(text).toBe('Bản nháp.');
  });

  it('skips empty untranslated paragraphs in translation mode', () => {
    expect(chapterHasTranslatableContent(sampleParagraphs)).toBe(true);
    expect(chapterHasTranslatableContent([{ ...sampleParagraphs[1] }])).toBe(false);
  });

  it('builds bilingual blocks', () => {
    const text = buildChapterPlainText(1, null, sampleParagraphs, 'bilingual', {
      includeTitle: false,
    });
    expect(text).toContain('一段。');
    expect(text).toContain('Đoạn một.');
  });
});

describe('sanitize-filename', () => {
  it('removes invalid Windows characters', () => {
    expect(sanitizeFilename('Chương: 451/TEST')).toBe('Chương_ 451_TEST');
  });

  it('builds padded chapter export filename', () => {
    expect(buildChapterExportFilename(451, 'Hành*Trình', 'txt')).toBe(
      '0451 - Hành_Trình.txt',
    );
  });
});

describe('chapter-clipboard-service', () => {
  it('disables copy when no translated content', () => {
    expect(
      canCopyChapter({
        chapterNumber: 1,
        title: 'T',
        paragraphs: [{ stableParagraphId: 'p1', sourceText: 'x', translatedText: '' }],
        mode: 'translation',
      }),
    ).toBe(false);
  });

  it('allows copy with draft even if DB translation empty', () => {
    expect(
      canCopyChapter({
        chapterNumber: 1,
        title: 'T',
        paragraphs: [
          {
            stableParagraphId: 'p1',
            sourceText: 'x',
            translatedText: '',
            draftText: 'draft',
          },
        ],
        mode: 'translation',
      }),
    ).toBe(true);
  });
});

describe('formatExportChapterHeading parity', () => {
  it('keeps chapter-like titles', () => {
    expect(formatExportChapterHeading(451, '第451章 修炼')).toBe('第451章 修炼');
  });
});
