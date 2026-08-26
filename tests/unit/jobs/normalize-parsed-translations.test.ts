import { describe, expect, it } from 'vitest';
import { ResponseParser } from '@main/jobs/response-parser';
import { runLocalQa } from '@main/jobs/qa-checker';
import {
  normalizeParsedTranslations,
  qaErrorsAreOnlyIdNoise,
} from '@main/jobs/normalize-parsed-translations';

const P1 = '[C000001:P000001]';
const P2 = '[C000001:P000002]';

describe('normalizeParsedTranslations', () => {
  it('drops duplicates and unknown IDs then QA passes', () => {
    const parsed = new ResponseParser().parse(
      [
        '<TRANSLATION>',
        `${P1} Một.`,
        `${P1} Một lại.`,
        `[C009999:P000001] Rác.`,
        `${P2} Hai.`,
        '</TRANSLATION>',
        '<TERM_DELTA>[]</TERM_DELTA>',
        '<MEMORY_DELTA>[]</MEMORY_DELTA>',
      ].join('\n'),
    );
    const before = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, P2],
    });
    expect(before.verdict).toBe('MANUAL_REVIEW');
    expect(qaErrorsAreOnlyIdNoise(before)).toBe(true);

    const cleaned = normalizeParsedTranslations(parsed, [P1, P2]);
    expect(cleaned.changed).toBe(true);
    expect(cleaned.droppedDup).toBe(1);
    expect(cleaned.droppedUnknown).toBe(1);
    expect(cleaned.parsed.translations).toHaveLength(2);
    expect(cleaned.parsed.translations[0]?.text).toBe('Một.');

    const after = runLocalQa({
      parsed: cleaned.parsed,
      sourceParagraphIds: [P1, P2],
    });
    expect(after.verdict === 'PASS' || after.verdict === 'PASS_WITH_WARNINGS').toBe(
      true,
    );
  });
});
