import { describe, expect, it } from 'vitest';
import {
  isGeminiSoftErrorText,
  geminiSoftErrorSnippet,
} from '@shared/utils/gemini-soft-error';
import { formatJobAttemptDetail } from '../../../src/renderer/utils/job-attempt-summary';
import type { JobAttemptDto } from '@shared/schemas/job';

describe('isGeminiSoftErrorText', () => {
  it('detects known Gemini soft errors', () => {
    expect(isGeminiSoftErrorText('Sorry, something went wrong. Please try your request again.')).toBe(
      true,
    );
    expect(
      isGeminiSoftErrorText('I encountered an error doing what you asked. Could you try again?'),
    ).toBe(true);
    expect(
      isGeminiSoftErrorText(
        "I'm having a hard time fulfilling your request. Can I help you with something else instead?",
      ),
    ).toBe(true);
  });

  it('rejects real translation payloads', () => {
    const ok = [
      '<TRANSLATION>',
      '[C000001:P000001] Xin chào',
      '</TRANSLATION>',
      '<TERM_DELTA>[]</TERM_DELTA>',
      '<MEMORY_DELTA>[]</MEMORY_DELTA>',
    ].join('\n');
    expect(isGeminiSoftErrorText(ok)).toBe(false);
    expect(isGeminiSoftErrorText('[C000001:P000001] text only')).toBe(false);
  });

  it('rejects long prose without protocol', () => {
    expect(isGeminiSoftErrorText('x'.repeat(900))).toBe(false);
  });
});

describe('formatJobAttemptDetail', () => {
  const base: JobAttemptDto = {
    id: '11111111-1111-4111-8111-111111111111',
    jobId: '22222222-2222-4222-8222-222222222222',
    attemptNumber: 1,
    state: 'FAILED',
    reason: 'MALFORMED_OUTPUT',
    inputRef: 'corr:x',
    output: null,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };

  it('explains soft-error parse failure instead of dumping missing IDs JSON', () => {
    const detail = formatJobAttemptDetail({
      ...base,
      output: 'Sorry, something went wrong. Please try your request again.',
      result: JSON.stringify({
        parseStatus: 'needs_repair',
        verdict: 'REPAIR_REQUIRED',
        missing: ['[C000001:P000001]', '[C000001:P000002]'],
        empty: [],
        reason: 'MALFORMED_OUTPUT',
      }),
      error: 'MALFORMED_OUTPUT',
    });
    expect(detail.toLowerCase()).toMatch(/gemini|soft|lỗi|error|something went wrong/i);
    expect(detail).not.toMatch(/parseStatus/);
    expect(detail).not.toMatch(/C000001:P000001.*C000001:P000002.*C000001:P000003/);
  });

  it('explains repair_send soft error', () => {
    const detail = formatJobAttemptDetail({
      ...base,
      state: 'SUCCEEDED',
      output: 'I encountered an error doing what you asked. Could you try again?',
      result: JSON.stringify({
        phase: 'repair_send',
        reason: 'MALFORMED_OUTPUT',
        mode: 'malformed_full',
      }),
    });
    expect(detail.toLowerCase()).toMatch(/sửa|repair|gemini|error|lỗi/i);
  });

  it('summarizes missing paragraphs without raw JSON dump', () => {
    const detail = formatJobAttemptDetail({
      ...base,
      output: 'hello world without ids',
      result: JSON.stringify({
        parseStatus: 'needs_repair',
        verdict: 'REPAIR_REQUIRED',
        missing: Array.from({ length: 48 }, (_, i) => `[C000001:P${String(i + 1).padStart(6, '0')}]`),
        empty: [],
        reason: 'MALFORMED_OUTPUT',
      }),
    });
    expect(detail).toMatch(/48/);
    expect(detail).not.toContain('"missing"');
  });
});

describe('geminiSoftErrorSnippet', () => {
  it('collapses whitespace', () => {
    expect(geminiSoftErrorSnippet('a\n\nb')).toBe('a b');
  });
});
