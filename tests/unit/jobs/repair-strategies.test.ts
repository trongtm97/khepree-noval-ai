import { describe, it, expect } from 'vitest';
import { ResponseParser } from '@main/jobs/response-parser';
import { runLocalQa } from '@main/jobs/qa-checker';
import {
  classifyRepairReason,
  buildRepairPlan,
  selectRepairStrategy,
} from '@main/jobs/repair-strategies';

const P1 = '[C000001:P000001]';
const P2 = '[C000001:P000002]';
const batch = [
  { paragraphId: P1, sourceText: '第一' },
  { paragraphId: P2, sourceText: '他使用灵气。' },
];

const parser = new ResponseParser();

function parse(raw: string) {
  return parser.parse(raw);
}

describe('classifyRepairReason + strategies', () => {
  it('MISSING_PARAGRAPH → translation_missing plan with only missing IDs', () => {
    const parsed = parse(
      `<TRANSLATION>\n${P1} A.\n</TRANSLATION>\n<TERM_DELTA>[]</TERM_DELTA>\n<MEMORY_DELTA>[]</MEMORY_DELTA>`,
    );
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
      sourceParagraphs: batch,
    });
    const reason = classifyRepairReason(parsed, qa);
    expect(reason).toBe('MISSING_PARAGRAPH');
    if (reason !== 'MISSING_PARAGRAPH') throw new Error('unreachable');
    const plan = buildRepairPlan({
      reason,
      qa,
      parsed,
      batchParagraphs: batch,
    });
    expect(plan.mode).toBe('translation_missing');
    expect(plan.retranslate).toBe(true);
    expect(plan.targetParagraphIds).toEqual([P2]);
    expect(plan.prompt).toContain(P2);
    expect(plan.prompt).toContain('Translate ONLY these source paragraphs');
    // Missing ID is the translate target; P1 may appear only as context
    expect(plan.prompt).toMatch(/Translate ONLY[\s\S]*\[C000001:P000002]/);
  });

  it('EMPTY_PARAGRAPH strategy', () => {
    const parsed = parse(
      `<TRANSLATION>\n${P1}\n${P2} B.\n</TRANSLATION>\n<TERM_DELTA>[]</TERM_DELTA>\n<MEMORY_DELTA>[]</MEMORY_DELTA>`,
    );
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
      sourceParagraphs: batch,
    });
    expect(classifyRepairReason(parsed, qa)).toBe('EMPTY_PARAGRAPH');
    const plan = buildRepairPlan({
      reason: 'EMPTY_PARAGRAPH',
      qa,
      parsed,
      batchParagraphs: batch,
    });
    expect(plan.mode).toBe('translation_empty');
    expect(plan.targetParagraphIds).toContain(P1);
  });

  it('CORRUPT_PARAGRAPH strategy targets only leak IDs', () => {
    const parsed = parse(
      `<TRANSLATION>\n${P1} Đã tắt ng<TRANSLATION>\n${P2} Đoạn hai ổn.\n</TRANSLATION>\n<TERM_DELTA>[]</TERM_DELTA>\n<MEMORY_DELTA>[]</MEMORY_DELTA>`,
    );
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
      sourceParagraphs: batch,
    });
    expect(classifyRepairReason(parsed, qa)).toBe('CORRUPT_PARAGRAPH');
    const plan = buildRepairPlan({
      reason: 'CORRUPT_PARAGRAPH',
      qa,
      parsed,
      batchParagraphs: batch,
    });
    expect(plan.mode).toBe('translation_corrupt');
    expect(plan.retranslate).toBe(true);
    expect(plan.targetParagraphIds).toEqual([P1]);
    expect(plan.prompt).toMatch(/CORRUPT|protocol tags/i);
    expect(plan.prompt).toContain(P1);
  });

  it('MALFORMED_OUTPUT when no tags', () => {
    const parsed = parse('hello world no protocol');
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
      sourceParagraphs: batch,
    });
    expect(classifyRepairReason(parsed, qa)).toBe('MALFORMED_OUTPUT');
    const strategy = selectRepairStrategy({
      reason: 'MALFORMED_OUTPUT',
      qa,
      parsed,
      batchParagraphs: batch,
    });
    expect(strategy.reason).toBe('MALFORMED_OUTPUT');
    const plan = strategy.buildPlan({
      reason: 'MALFORMED_OUTPUT',
      qa,
      parsed,
      batchParagraphs: batch,
    });
    expect(plan.retranslate).toBe(true);
  });

  it('TERM_VIOLATION strategy', () => {
    const parsed = parse(
      `<TRANSLATION>\n${P1} A.\n${P2} Hắn dùng linh khi.\n</TRANSLATION>\n<TERM_DELTA>[]</TERM_DELTA>\n<MEMORY_DELTA>[]</MEMORY_DELTA>`,
    );
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
      sourceParagraphs: batch,
      lockedTerms: [
        {
          source: '灵气',
          preferred: 'linh khí',
          forbiddenVariants: ['linh khi'],
        },
      ],
    });
    expect(classifyRepairReason(parsed, qa)).toBe('TERM_VIOLATION');
    const plan = buildRepairPlan({
      reason: 'TERM_VIOLATION',
      qa,
      parsed,
      batchParagraphs: batch,
      lockedTermHints: [
        { source: '灵气', preferred: 'linh khí', paragraphIds: [P2] },
      ],
    });
    expect(plan.mode).toBe('term_violation');
    expect(plan.prompt).toContain('linh khí');
  });

  it('duplicate paragraph IDs → normalize locally (no MALFORMED AI repair)', () => {
    const parsed = parse(
      `<TRANSLATION>\n${P1} A.\n${P1} A dup.\n${P2} B.\n</TRANSLATION>\n<TERM_DELTA>[]</TERM_DELTA>\n<MEMORY_DELTA>[]</MEMORY_DELTA>`,
    );
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
      sourceParagraphs: batch,
    });
    expect(qa.verdict).toBe('MANUAL_REVIEW');
    // After local normalize, classify should not force MALFORMED_OUTPUT.
    expect(classifyRepairReason(parsed, qa)).toBeNull();
  });

  it('invalid MEMORY_DELTA with full translations soft-fails (no repair)', () => {
    const parsed = parse(
      [
        '<TRANSLATION>',
        `${P1} A.`,
        `${P2} B.`,
        '</TRANSLATION>',
        '<TERM_DELTA>',
        '[]',
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '{not valid json!!!',
        '</MEMORY_DELTA>',
      ].join('\n'),
    );
    expect(parsed.status).toBe('recovered');
    expect(parsed.translations).toHaveLength(2);
    expect(parsed.memoryDeltas).toEqual([]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
      sourceParagraphs: batch,
    });
    expect(qa.verdict === 'PASS' || qa.verdict === 'PASS_WITH_WARNINGS').toBe(true);
    expect(classifyRepairReason(parsed, qa)).toBeNull();
  });

  it('MEMORY_JSON_INVALID strategy still builds deltas_only when forced', () => {
    const plan = buildRepairPlan({
      reason: 'MEMORY_JSON_INVALID',
      qa: {
        verdict: 'REPAIR_REQUIRED',
        passed: false,
        errors: [],
        warnings: [],
        missingParagraphIds: [],
        emptyParagraphIds: [],
        corruptParagraphIds: [],
        duplicateParagraphIds: [],
        unknownParagraphIds: [],
        outOfOrder: false,
      },
      parsed: {
        status: 'needs_repair',
        translations: [
          { paragraphId: P1, text: 'A.' },
          { paragraphId: P2, text: 'B.' },
        ],
        termDeltas: [],
        memoryDeltas: [],
        warnings: [],
        recoveryUsed: true,
        protocolVersion: 1,
      },
      batchParagraphs: batch,
    });
    expect(plan.retranslate).toBe(false);
    expect(plan.mode).toBe('deltas_only');
    expect(plan.targetParagraphIds).toEqual([]);
    expect(plan.prompt).toMatch(/Do NOT re-translate/i);
  });
});
