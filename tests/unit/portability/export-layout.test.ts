import { describe, expect, it } from 'vitest';
import {
  formatExportChapterHeading,
  renderChapterHtml,
  renderChapterPlainText,
  type NovelExportChapter,
} from '@main/portability/novel-export-builder';

describe('export layout fidelity', () => {
  it('formatExportChapterHeading keeps original chapter-like titles', () => {
    expect(formatExportChapterHeading(1, '第一章 开端')).toBe('第一章 开端');
    expect(formatExportChapterHeading(2, 'Chapter 2')).toBe('Chapter 2');
    expect(formatExportChapterHeading(3, 'Opening')).toBe('Chương 3: Opening');
    expect(formatExportChapterHeading(4, null)).toBe('Chương 4');
  });

  it('TXT spacing follows trailingNewlines', () => {
    const chapter: NovelExportChapter = {
      chapterNumber: 1,
      title: 'Opening',
      paragraphs: [
        {
          stableParagraphId: '[C000001:P000001]',
          sequence: 1,
          sourceText: '一段。',
          translatedText: 'Đoạn một.',
          trailingNewlines: 2,
        },
        {
          stableParagraphId: '[C000001:P000002]',
          sequence: 2,
          sourceText: '二段。',
          translatedText: 'Đoạn hai.',
          trailingNewlines: 1,
        },
      ],
    };

    const withBlank = renderChapterPlainText(chapter, {
      includeChapterTitles: false,
      includeParagraphIds: false,
      useTranslation: true,
    });
    expect(withBlank).toBe('Đoạn một.\n\nĐoạn hai.');

    const adjacent: NovelExportChapter = {
      ...chapter,
      paragraphs: chapter.paragraphs.map((p) => ({ ...p, trailingNewlines: 1 })),
    };
    const tight = renderChapterPlainText(adjacent, {
      includeChapterTitles: false,
      includeParagraphIds: false,
      useTranslation: true,
    });
    expect(tight).toBe('Đoạn một.\nĐoạn hai.');
  });

  it('EPUB uses br for internal newlines and spacer for blank trailing', () => {
    const chapter: NovelExportChapter = {
      chapterNumber: 1,
      title: '第一章',
      paragraphs: [
        {
          stableParagraphId: '[C000001:P000001]',
          sequence: 1,
          sourceText: '甲\n乙',
          translatedText: 'A\nB',
          trailingNewlines: 2,
        },
      ],
    };
    const html = renderChapterHtml(chapter, {
      includeChapterTitles: true,
      includeParagraphIds: false,
      useTranslation: true,
    });
    expect(html).toContain('<h1>第一章</h1>');
    expect(html).toContain('<p>A<br/>B</p>');
    expect(html).toContain('<p><br/></p>');
  });
});
