import { describe, it, expect } from 'vitest';
import { ResponseParser } from '@main/jobs/response-parser';
import { runLocalQa } from '@main/jobs/qa-checker';
import { buildRepairPack } from '@main/jobs/repair-pack-builder';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';

const P1 = '[C000001:P000001]';
const P2 = '[C000001:P000002]';
const P3 = '[C000001:P000003]';
const P4 = '[C000001:P000004]';

const parser = new ResponseParser();

function parseOk(lines: string[]): ParsedBatchResult {
  const raw = [
    '<TRANSLATION>',
    ...lines,
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
  return parser.parse(raw);
}

describe('runLocalQa', () => {
  it('PASS when all IDs present and ordered', () => {
    const parsed = parseOk([`${P1} A.`, `${P2} B.`, `${P3} C.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2, P3],
    });
    expect(qa.verdict).toBe('PASS');
    expect(qa.passed).toBe(true);
    expect(qa.missingParagraphIds).toEqual([]);
  });

  it('PASS_WITH_WARNINGS on out-of-order', () => {
    const parsed = parseOk([`${P2} B.`, `${P1} A.`, `${P3} C.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2, P3],
    });
    expect(qa.outOfOrder).toBe(true);
    expect(qa.verdict).toBe('PASS_WITH_WARNINGS');
    expect(qa.passed).toBe(true);
  });

  it('REPAIR_REQUIRED on missing paragraphs', () => {
    const parsed = parseOk([`${P1} A.`, `${P3} C.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2, P3],
    });
    expect(qa.verdict).toBe('REPAIR_REQUIRED');
    expect(qa.missingParagraphIds).toEqual([P2]);
    expect(qa.errors.some((e) => e.code === 'missing_paragraph')).toBe(true);
  });

  it('REPAIR_REQUIRED on empty translation', () => {
    const parsed = parseOk([P1, `${P2} B.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
    });
    expect(qa.emptyParagraphIds).toContain(P1);
    expect(qa.verdict).toBe('REPAIR_REQUIRED');
  });

  it('REPAIR_REQUIRED when translation leaks protocol tag', () => {
    const parsed = parseOk([
      `${P1} Hương khói đã tắt ng<TRANSLATION>`,
      `${P2} Đoạn hai ổn.`,
    ]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
      sourceParagraphs: [
        { paragraphId: P1, sourceText: '香火已经熄灭了。' },
        { paragraphId: P2, sourceText: '第二段。' },
      ],
    });
    expect(qa.corruptParagraphIds).toEqual([P1]);
    expect(qa.verdict).toBe('REPAIR_REQUIRED');
    expect(qa.errors.some((e) => e.code === 'corrupt_translation')).toBe(true);
  });

  it('REPAIR_REQUIRED on truncated short fragment vs long source', () => {
    const longSource =
      '这是一段很长的中文原文用来测试翻译被截断时的质量检查逻辑是否能正确发现。';
    const parsed = parseOk([`${P1} , vui vẻ hơn rất nhiều`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1],
      sourceParagraphs: [{ paragraphId: P1, sourceText: longSource }],
    });
    expect(qa.corruptParagraphIds).toContain(P1);
    expect(qa.verdict).toBe('REPAIR_REQUIRED');
  });

  it('MANUAL_REVIEW on duplicate IDs', () => {
    const parsed = parseOk([`${P1} A.`, `${P1} A2.`, `${P2} B.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
    });
    expect(qa.duplicateParagraphIds).toContain(P1);
    expect(qa.verdict).toBe('MANUAL_REVIEW');
  });

  it('MANUAL_REVIEW on unknown IDs', () => {
    const parsed = parseOk([`${P1} A.`, `${P4} Extra.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1],
    });
    expect(qa.unknownParagraphIds).toContain(P4);
    expect(qa.verdict).toBe('MANUAL_REVIEW');
  });

  it('MANUAL_REVIEW when locked preferred missing', () => {
    const parsed = parseOk([`${P1} Hắn dùng khí lực.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1],
      sourceParagraphs: [{ paragraphId: P1, sourceText: '他使用灵气。' }],
      lockedTerms: [
        {
          source: '灵气',
          preferred: 'linh khí',
          forbiddenVariants: ['linh khi', 'khí linh'],
        },
      ],
    });
    expect(qa.errors.some((e) => e.code === 'locked_term_missing')).toBe(true);
    expect(qa.verdict).toBe('MANUAL_REVIEW');
  });

  it('MANUAL_REVIEW when forbidden variant used (no auto-replace)', () => {
    const parsed = parseOk([`${P1} Hắn dùng linh khi mạnh.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1],
      sourceParagraphs: [{ paragraphId: P1, sourceText: '他使用灵气。' }],
      lockedTerms: [
        {
          source: '灵气',
          preferred: 'linh khí',
          forbiddenVariants: ['linh khi'],
        },
      ],
    });
    expect(
      qa.errors.some((e) => e.code === 'locked_term_forbidden_variant'),
    ).toBe(true);
    // Text unchanged — QA only flags
    expect(parsed.translations[0]?.text).toBe('Hắn dùng linh khi mạnh.');
    expect(qa.verdict).toBe('MANUAL_REVIEW');
  });

  it('PASS when locked preferred present and no forbidden', () => {
    const parsed = parseOk([`${P1} Hắn dùng linh khí.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1],
      sourceParagraphs: [{ paragraphId: P1, sourceText: '他使用灵气。' }],
      lockedTerms: [
        {
          source: '灵气',
          preferred: 'linh khí',
          forbiddenVariants: ['linh khi'],
        },
      ],
    });
    expect(qa.verdict).toBe('PASS');
  });

  it('skips locked check when source term not in paragraph', () => {
    const parsed = parseOk([`${P1} Hắn bước đi.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1],
      sourceParagraphs: [{ paragraphId: P1, sourceText: '他走了。' }],
      lockedTerms: [
        {
          source: '灵气',
          preferred: 'linh khí',
          forbiddenVariants: ['linh khi'],
        },
      ],
    });
    expect(qa.verdict).toBe('PASS');
  });

  it('MANUAL_REVIEW when parse needs_repair without clear missing set', () => {
    const parsed = parser.parse('Totally broken response with no tags.');
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
    });
    expect(parsed.status).toBe('needs_repair');
    expect(['REPAIR_REQUIRED', 'MANUAL_REVIEW']).toContain(qa.verdict);
  });
});

describe('buildRepairPack', () => {
  const batch = [
    { paragraphId: P1, sourceText: '第一段' },
    { paragraphId: P2, sourceText: '第二段' },
    { paragraphId: P3, sourceText: '第三段' },
    { paragraphId: P4, sourceText: '第四段' },
  ];

  it('includes only missing paragraphs + local context', () => {
    const pack = buildRepairPack({
      missingParagraphIds: [P2, P3],
      batchParagraphs: batch,
      contextRadius: 1,
    });
    expect(pack.paragraphs.map((p) => p.paragraphId)).toEqual([P2, P3]);
    expect(pack.contextParagraphs.map((p) => p.paragraphId)).toEqual([P1, P4]);
    expect(pack.prompt).toContain(P2);
    expect(pack.prompt).toContain('第二段');
    expect(pack.prompt).not.toContain('第一段\n第三段'); // full chapter dump avoided
    // Prompt must ask ONLY for TRANSLATION of missing IDs
    expect(pack.prompt).toMatch(/ONLY the <TRANSLATION>/i);
  });

  it('does not re-send entire chapter when one missing', () => {
    const pack = buildRepairPack({
      missingParagraphIds: [P3],
      batchParagraphs: batch,
      contextRadius: 1,
    });
    expect(pack.paragraphs).toHaveLength(1);
    expect(pack.contextParagraphs.map((p) => p.paragraphId)).toEqual([P2, P4]);
    // Source texts of non-context non-missing (P1) must not appear as translate targets
    expect(pack.prompt).not.toContain(`${P1} 第一段`);
  });

  it('throws when missing list empty', () => {
    expect(() =>
      buildRepairPack({ missingParagraphIds: [], batchParagraphs: batch }),
    ).toThrow();
  });
});
