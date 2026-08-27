import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';
import { detectAndDecode } from '@main/import/encoding';
import { normalizeNovelText } from '@main/import/paragraphs/normalize';
import { segmentParagraphs } from '@main/import/paragraphs/segment';
import {
  detectChapters,
  applyManualSplits,
  parseChineseOrdinal,
} from '@main/import/chapter-detector';
import {
  formatParagraphId,
  parseStableParagraphId,
} from '@shared/utils/stable-id';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURE = path.resolve(__dirname, '../../fixtures/import/chinese-web-novel.txt');

describe('encoding detection', () => {
  it('reads UTF-8 BOM', () => {
    const body = Buffer.from('第一章\n内容', 'utf8');
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);
    const result = detectAndDecode(buf);
    expect(result.encoding).toBe('utf-8-bom');
    expect(result.text).toContain('第一章');
  });

  it('falls back to GBK/GB18030 for Chinese bytes', () => {
    const text = '第一章 开端\n林风走在路上。';
    const buf = iconv.encode(text, 'gbk');
    const result = detectAndDecode(buf, { sourceLanguage: 'zh-Hans' });
    expect(['gbk', 'gb18030']).toContain(result.encoding);
    expect(result.text).toContain('第一章');
    expect(result.text).toContain('林风');
  });

  it('does not force GB on English/generic path', () => {
    const buf = Buffer.from([0x80, 0x81, 0x82, 0x83]);
    const result = detectAndDecode(buf, { sourceLanguage: 'en' });
    expect(['gbk', 'gb18030']).not.toContain(result.encoding);
  });
});

describe('normalize + paragraphs', () => {
  it('preserves content while collapsing blank runs', () => {
    const out = normalizeNovelText('甲  \r\n\r\n\r\n乙\t\t丙  ');
    expect(out).toBe('甲\n\n乙 丙');
  });

  it('segments blank-line paragraphs', () => {
    const paras = segmentParagraphs('一段。\n\n二段。\n\n\n三段。');
    expect(paras.map((p) => p.text)).toEqual(['一段。', '二段。', '三段。']);
    expect(paras[0]?.trailingNewlines).toBe(2);
    expect(paras[1]?.trailingNewlines).toBe(2);
    expect(paras[2]?.trailingNewlines).toBe(1);
  });

  it('merges dense one-line-per-sentence into multi-sentence paragraphs', () => {
    const lines = Array.from(
      { length: 30 },
      (_, i) =>
        `这是第${i + 1}句，内容写得更长一些以便累计字符达到软限制后在句号处切段。`,
    );
    const dense = lines.join('\n');
    const paras = segmentParagraphs(dense);
    expect(paras.length).toBeGreaterThan(1);
    expect(paras.length).toBeLessThan(30);
    expect(paras.every((p) => p.text.includes('。'))).toBe(true);
    expect(paras.some((p) => p.text.includes('\n'))).toBe(true);
  });
});

describe('stable IDs', () => {
  it('formats [C000001:P000001] independent of title', () => {
    expect(formatParagraphId(1, 1)).toBe('[C000001:P000001]');
    expect(formatParagraphId(12, 3)).toBe('[C000012:P000003]');
    const parsed = parseStableParagraphId('[C000012:P000003]');
    expect(parsed?.chapterNumber).toBe(12);
    expect(parsed?.paragraphSequence).toBe(3);
  });
});

describe('Chinese ordinal parse', () => {
  it('parses mixed forms', () => {
    expect(parseChineseOrdinal('一')).toBe(1);
    expect(parseChineseOrdinal('十二')).toBe(12);
    expect(parseChineseOrdinal('123')).toBe(123);
    expect(parseChineseOrdinal('１２３')).toBe(123);
  });
});

describe('ChapterDetector pipeline', () => {
  it('detects Chinese web novel patterns + volumes + English', () => {
    const raw = fs.readFileSync(FIXTURE, 'utf8');
    const result = detectChapters(raw);
    const titles = result.chapters.map((c) => c.title);

    expect(titles.some((t) => /卷一|第一卷|起源/.test(t) || t.includes('卷一'))).toBe(true);
    expect(titles.some((t) => t.includes('第一章') || t.includes('开端'))).toBe(true);
    expect(titles.some((t) => t.includes('第二章'))).toBe(true);
    expect(titles.some((t) => t.includes('第十二章'))).toBe(true);
    expect(titles.some((t) => t.includes('第123章'))).toBe(true);
    expect(titles.some((t) => /第１２３章|第123章/.test(t))).toBe(true);
    expect(titles.some((t) => /Chapter 1/i.test(t))).toBe(true);

    // duplicate titles flagged
    const dups = result.chapters.filter((c) => c.isDuplicateTitle);
    expect(dups.length).toBeGreaterThanOrEqual(2);

    // very long line with embedded 第一章 should not become a heading
    expect(titles.every((t) => t.length <= 80)).toBe(true);

    // paragraph counts present
    expect(result.chapters.every((c) => c.paragraphCount >= 0)).toBe(true);
    expect(result.chapters.some((c) => c.paragraphCount >= 1)).toBe(true);
  });

  it('handles blank lines and very long chapters', () => {
    const longBody = '句。'.repeat(5000);
    const raw = `第一章\n\n\n短段。\n\n第二章\n\n${longBody}`;
    const result = detectChapters(raw);
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    const long = result.chapters.find((c) => c.title.includes('第二章'));
    expect(long).toBeDefined();
    expect(long?.characterCount).toBeGreaterThan(1000);
  });

  it('supports manual splits', () => {
    const raw = 'AAA\nBBB\nCCC';
    const result = applyManualSplits(raw, [
      { offset: 0, title: 'Part A' },
      { offset: 4, title: 'Part B' },
    ]);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]?.title).toBe('Part A');
    expect(result.chapters[1]?.title).toBe('Part B');
  });

  it('tolerates malformed input without crashing', () => {
    const result = detectChapters('第章\n\n@@@\n\n');
    expect(result.chapters.length).toBeGreaterThanOrEqual(1);
    expect(result.overallConfidence).toBeGreaterThan(0);
  });
});
