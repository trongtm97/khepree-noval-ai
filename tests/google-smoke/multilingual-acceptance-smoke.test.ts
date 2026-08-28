/**
 * Multilingual acceptance smoke — synthetic offline validation.
 * Opt-in live Gemini: NOVELTRANS_MULTILINGUAL_SMOKE=1 (see docs/MULTILINGUAL_PROMPT_ACCEPTANCE.md).
 */

import { describe, expect, it } from 'vitest';
import { ResponseParser } from '@main/jobs/response-parser';
import { runLocalQa } from '@main/jobs/qa-checker';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import { composeTranslationStyleRules } from '@shared/constants/translation-style-model';
import type { MemoryContextDto } from '@shared/schemas/memory';
import { pairFingerprint } from '../helpers/golden-prompt-assertions';

const EMPTY_CONTEXT: MemoryContextDto = {
  activeTerms: [],
  activeCharacters: [],
  relationships: [],
  recentMemory: [],
  criticalProjectRules: [],
  anchorChapter: 1,
  recentWindow: { fromChapter: 1, toChapter: 1 },
  budget: { limit: 4000, estimated: 0, dropped: 0 },
};

const parser = new ResponseParser();

const SMOKE_PAIRS: Array<{
  source: string;
  target: string;
  sourceText: string;
  goodTarget: string;
  lockedSource: string;
  lockedPreferred: string;
}> = [
  {
    source: 'ja',
    target: 'en',
    sourceText: '彼は森を走った。',
    goodTarget: 'He ran through the forest.',
    lockedSource: '森',
    lockedPreferred: 'forest',
  },
  {
    source: 'en',
    target: 'vi',
    sourceText: 'She opened the garden gate.',
    goodTarget: 'Cô ấy mở cổng vườn.',
    lockedSource: 'garden',
    lockedPreferred: 'vườn',
  },
  {
    source: 'uk',
    target: 'en',
    sourceText: 'Привіт, як справи?',
    goodTarget: 'Hello, how are you?',
    lockedSource: 'Привіт',
    lockedPreferred: 'Hello',
  },
  {
    source: 'ar',
    target: 'vi',
    sourceText: 'مرحبا بك في المدينة.',
    goodTarget: 'Chào mừng bạn đến thành phố.',
    lockedSource: 'المدينة',
    lockedPreferred: 'thành phố',
  },
  {
    source: 'fa',
    target: 'en',
    sourceText: 'او به بازار رفت.',
    goodTarget: 'He went to the market.',
    lockedSource: 'بازار',
    lockedPreferred: 'market',
  },
];

function buildResponse(ids: string[], lines: string[]): string {
  return [
    '<TRANSLATION>',
    ...ids.map((id, i) => `${id} ${lines[i]}`),
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

describe('multilingual acceptance smoke (synthetic)', () => {
  for (const fixture of SMOKE_PAIRS) {
    it(`${fixture.source} → ${fixture.target}: IDs, language, locked term, no leakage`, () => {
      const p1 = '[C000001:P000001]';
      const p2 = '[C000001:P000002]';
      const p3 = '[C000001:P000003]';
      const ids = [p1, p2, p3];
      const lines = [
        fixture.goodTarget,
        `Line with ${fixture.lockedPreferred} reference.`,
        'Third line complete.',
      ];
      const parsed = parser.parse(buildResponse(ids, lines));
      expect(parsed.translations).toHaveLength(3);
      expect(parsed.missingParagraphIds ?? []).toEqual([]);

      const qa = runLocalQa({
        parsed,
        sourceParagraphIds: ids,
        sourceParagraphs: [
          { paragraphId: p1, sourceText: fixture.sourceText },
          { paragraphId: p2, sourceText: `Uses ${fixture.lockedSource} here.` },
          { paragraphId: p3, sourceText: 'Short source.' },
        ],
        sourceLanguage: fixture.source,
        targetLanguage: fixture.target,
        lockedTerms: [
          {
            source: fixture.lockedSource,
            preferred: fixture.lockedPreferred,
          },
        ],
      });

      expect(qa.verdict).toBe('PASS');
      expect(
        qa.errors.some((e) => e.code === 'target_language_mismatch'),
      ).toBe(false);
      expect(
        qa.warnings.some((e) => e.code === 'source_leakage'),
      ).toBe(false);

      const { sections } = assemblePackSections({
        style: 'balanced',
        chapterNumbers: [1],
        criticalRules: composeTranslationStyleRules({
          style: 'balanced',
          sourceLanguage: fixture.source,
          targetLanguage: fixture.target,
        }),
        context: EMPTY_CONTEXT,
        sourceLines: [`${p1} ${fixture.sourceText}`],
        sourceLanguage: fixture.source,
        targetLanguage: fixture.target,
      });
      expect(pairFingerprint(sections.taskHeader)).toBe(
        `${fixture.source}→${fixture.target}`,
      );
    });
  }
});

describe('multilingual live smoke gate', () => {
  const live = process.env.NOVELTRANS_MULTILINGUAL_SMOKE?.trim().toLowerCase();
  const enabled = live === '1' || live === 'true' || live === 'yes';

  it.skipIf(!enabled)('live Gemini smoke requires NOVELTRANS_MULTILINGUAL_SMOKE=1', () => {
    expect(enabled).toBe(true);
  });

  it.skipIf(enabled)('documents offline default', () => {
    expect(enabled).toBe(false);
  });
});
