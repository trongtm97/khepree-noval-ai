import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSLATE_BATCH_PARAGRAPHS,
  PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS,
} from '../../../src/shared/constants/job';
import {
  buildMergedTranslationProtocol,
  chunkParagraphBatch,
  chunkParagraphBatchForPlaywright,
  mergeTermDeltas,
  mergeMemoryDeltas,
  resolveTranslateBatchParagraphs,
  splitParagraphChunkInHalf,
} from '../../../src/main/jobs/translate-chunking';
import { ResponseParser } from '../../../src/main/jobs/response-parser';
import {
  appendPlaywrightProtocolNudge,
  sanitizeNotebookAssistantText,
} from '../../../src/shared/utils/notebook-response-sanitize';
import { composerFillLooksValid } from '../../../src/shared/utils/notebook-composer-fill';
import { PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK } from '../../../src/shared/constants/job';

describe('translate batch chunking', () => {
  it('keeps small chapters as one chunk', () => {
    const paras = Array.from({ length: 8 }, (_, i) => ({
      paragraphId: `[C000001:P${String(i + 1).padStart(6, '0')}]`,
    }));
    expect(chunkParagraphBatch(paras)).toHaveLength(1);
  });

  it('splits 48 paragraphs into 12-sized chunks (internal only)', () => {
    const paras = Array.from({ length: 48 }, (_, i) => ({
      paragraphId: `[C000001:P${String(i + 1).padStart(6, '0')}]`,
    }));
    const chunks = chunkParagraphBatch(paras);
    expect(chunks).toHaveLength(4);
    expect(chunks.every((c) => c.length <= DEFAULT_TRANSLATE_BATCH_PARAGRAPHS)).toBe(
      true,
    );
    expect(chunks.flat().map((p) => p.paragraphId)).toEqual(
      paras.map((p) => p.paragraphId),
    );
  });

  it('Playwright batch size keeps 48 paragraphs as one chunk', () => {
    const paras = Array.from({ length: 48 }, (_, i) => ({
      paragraphId: `[C000001:P${String(i + 1).padStart(6, '0')}]`,
    }));
    const size = resolveTranslateBatchParagraphs('PLAYWRIGHT_GEMINI');
    expect(size).toBe(PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS);
    expect(chunkParagraphBatch(paras, size)).toHaveLength(1);
  });

  it('Playwright char cap splits oversized source even under paragraph limit', () => {
    const paras = [
      { paragraphId: '[C000001:P000001]', sourceText: 'x'.repeat(25_000) },
      { paragraphId: '[C000001:P000002]', sourceText: 'y'.repeat(25_000) },
    ];
    const chunks = chunkParagraphBatchForPlaywright(paras);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.[0]?.paragraphId).toBe('[C000001:P000001]');
    expect(chunks[1]?.[0]?.paragraphId).toBe('[C000001:P000002]');
    expect(PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK).toBeGreaterThan(30_000);
  });

  it('splitParagraphChunkInHalf halves for soft-error recovery', () => {
    const paras = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    const halves = splitParagraphChunkInHalf(paras);
    expect(halves).not.toBeNull();
    expect(halves?.[0]).toHaveLength(3);
    expect(halves?.[1]).toHaveLength(2);
    expect(splitParagraphChunkInHalf([{ id: 1 }])).toBeNull();
  });

  it('composerFillLooksValid rejects empty or truncated fill', () => {
    expect(composerFillLooksValid(1000, 0)).toBe(false);
    expect(composerFillLooksValid(1000, 500)).toBe(false);
    expect(composerFillLooksValid(1000, 900)).toBe(true);
  });

  it('resolveTranslateBatchParagraphs: Web API stays 12, Playwright 120', () => {
    expect(resolveTranslateBatchParagraphs('GEMINI_WEB_API')).toBe(12);
    expect(resolveTranslateBatchParagraphs(null)).toBe(12);
    expect(resolveTranslateBatchParagraphs('PLAYWRIGHT_GEMINI')).toBe(120);
  });

  it('merges chunk lines into one protocol body', () => {
    const raw = buildMergedTranslationProtocol([
      { paragraphId: '[C000001:P000001]', text: 'Một' },
      { paragraphId: '[C000001:P000002]', text: 'Hai' },
    ]);
    expect(raw).toContain('<TRANSLATION>');
    expect(raw).toContain('[C000001:P000001] Một');
    expect(raw).toContain('[C000001:P000002] Hai');
    expect(raw).toContain('<TERM_DELTA>[]</TERM_DELTA>');
    expect(raw).toContain('<MEMORY_DELTA>[]</MEMORY_DELTA>');
  });

  it('preserves accumulated TERM/MEMORY deltas across chunks', () => {
    const raw = buildMergedTranslationProtocol(
      [{ paragraphId: '[C000001:P000001]', text: 'Một' }],
      [
        {
          action: 'discover',
          source: '筑基',
          target: 'Trúc Cơ',
          category: 'skill',
        },
      ],
      [
        {
          action: 'upsert',
          category: 'character',
          key: '王林',
          value: { translatedName: 'Vương Lâm' },
        },
      ],
    );
    expect(raw).toContain('筑基');
    expect(raw).toContain('王林');
    expect(raw).not.toContain('<TERM_DELTA>[]</TERM_DELTA>');
  });

  it('dedupes term and memory deltas from multiple chunks', () => {
    const terms = mergeTermDeltas([
      [
        {
          action: 'discover',
          source: '筑基',
          target: 'Trúc Cơ',
          category: 'skill',
        },
      ],
      [
        {
          action: 'discover',
          source: '筑基',
          target: 'Trúc Cơ',
          category: 'skill',
        },
        {
          action: 'discover',
          source: '金丹',
          target: 'Kim Đan',
          category: 'skill',
        },
      ],
    ]);
    expect(terms).toHaveLength(2);
    const memory = mergeMemoryDeltas([
      [
        {
          action: 'relationship',
          from: 'A',
          to: 'B',
          type: 'father',
          validFromChapter: 8,
        },
      ],
      [
        {
          action: 'relationship',
          from: 'A',
          to: 'B',
          type: 'father',
          validFromChapter: 8,
        },
      ],
    ]);
    expect(memory).toHaveLength(1);
  });
});

describe('notebook response sanitize + protocol nudge', () => {
  it('strips Thoughts expand_more chrome so parser sees TRANSLATION lines', () => {
    const dirty = [
      'Thoughts expand_more',
      'Chào bạn, tôi đã thực hiện dịch.',
      '<TRANSLATION>',
      '[C000001:P000001] Bản dịch thử.',
      '</TRANSLATION>',
      '<TERM_DELTA>[]</TERM_DELTA>',
      '<MEMORY_DELTA>[]</MEMORY_DELTA>',
    ].join('\n');
    const clean = sanitizeNotebookAssistantText(dirty);
    expect(clean).not.toMatch(/Thoughts/i);
    expect(clean).not.toMatch(/expand_more/i);
    const parsed = new ResponseParser().parse(clean);
    expect(parsed.translations).toHaveLength(1);
    expect(parsed.translations[0]?.text).toBe('Bản dịch thử.');
  });

  it('appendPlaywrightProtocolNudge is idempotent', () => {
    const once = appendPlaywrightProtocolNudge('Translate chapter.');
    expect(once).toContain('CRITICAL OUTPUT RULE (NotebookLM)');
    const twice = appendPlaywrightProtocolNudge(once);
    expect(twice).toBe(once);
  });
});
