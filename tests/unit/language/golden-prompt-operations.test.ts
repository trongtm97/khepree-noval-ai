import { describe, expect, it } from 'vitest';
import { ResponseParser } from '@main/jobs/response-parser';
import { runLocalQa } from '@main/jobs/qa-checker';
import { buildRepairPack } from '@main/jobs/repair-pack-builder';
import { buildContinuationPrompt } from '@main/jobs/continuation';
import { buildRepairPlan } from '@main/jobs/repair-strategies';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import { composeTranslationStyleRules } from '@shared/constants/translation-style-model';
import type { MemoryContextDto } from '@shared/schemas/memory';
import {
  assertGoldenPairLabels,
  pairFingerprint,
} from '../../helpers/golden-prompt-assertions';

const REPRESENTATIVE_PAIRS: [string, string, string][] = [
  ['ja', 'en', 'REPRESENTATIVE'],
  ['zh-Hans', 'vi', 'REPRESENTATIVE'],
  ['ar', 'fr', 'REPRESENTATIVE'],
];

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

const P1 = '[C000001:P000001]';
const P2 = '[C000001:P000002]';
const genericBatch = [
  { paragraphId: P1, sourceText: 'source one' },
  { paragraphId: P2, sourceText: 'source two' },
];

const LOCK_TOKEN = 'XLOCKTERM';
const LOCK_PREFERRED = 'PreferredLockForm';

function termViolationBatch(): typeof genericBatch {
  return [
    { paragraphId: P1, sourceText: `Alpha ${LOCK_TOKEN} one` },
    { paragraphId: P2, sourceText: `Beta ${LOCK_TOKEN} two` },
  ];
}

const parser = new ResponseParser();

describe('Golden prompt operations — all prompt types preserve pair', () => {
  for (const [source, target, _label] of REPRESENTATIVE_PAIRS) {
    const pairTag = `${source}-${target}`;

    it(`TRANSLATE ${pairTag}`, () => {
      const { sections } = assemblePackSections({
        style: 'balanced',
        chapterNumbers: [1],
        criticalRules: composeTranslationStyleRules({
          style: 'balanced',
          sourceLanguage: source,
          targetLanguage: target,
        }),
        context: EMPTY_CONTEXT,
        sourceLines: [`${P1} sample`],
        sourceLanguage: source,
        targetLanguage: target,
      });
      const prompt = `${sections.taskHeader}\n${sections.criticalRules}`;
      assertGoldenPairLabels(prompt, source, target);
      expect(pairFingerprint(prompt)).toBe(`${source}→${target}`);
    });

    it(`REPAIR ${pairTag}`, () => {
      const pack = buildRepairPack({
        missingParagraphIds: [P2],
        batchParagraphs: genericBatch,
        sourceLanguage: source,
        targetLanguage: target,
      });
      assertGoldenPairLabels(pack.prompt, source, target);
      expect(pack.prompt).toMatchSnapshot(`golden-repair-${pairTag}`);
    });

    it(`CONTINUATION ${pairTag}`, () => {
      const prompt = buildContinuationPrompt({
        fromParagraphId: P2,
        batchParagraphs: genericBatch,
        remainingParagraphIds: [P2],
        sourceLanguage: source,
        targetLanguage: target,
      });
      assertGoldenPairLabels(prompt, source, target);
      expect(prompt).toMatchSnapshot(`golden-continuation-${pairTag}`);
    });

    it(`TERM_VIOLATION ${pairTag}`, () => {
      const violationBatch = termViolationBatch();
      const parsed = parser.parse(
        [
          '<TRANSLATION>',
          `${P1} Alpha one.`,
          `${P2} Beta two.`,
          '</TRANSLATION>',
          '<TERM_DELTA>[]</TERM_DELTA>',
          '<MEMORY_DELTA>[]</MEMORY_DELTA>',
        ].join('\n'),
      );
      const qa = runLocalQa({
        parsed,
        sourceParagraphIds: [P1, P2],
        sourceParagraphs: violationBatch,
        sourceLanguage: source,
        targetLanguage: target,
        lockedTerms: [{ source: LOCK_TOKEN, preferred: LOCK_PREFERRED }],
      });
      const plan = buildRepairPlan({
        reason: 'TERM_VIOLATION',
        qa,
        parsed,
        batchParagraphs: violationBatch,
        lockedTermHints: [
          { source: LOCK_TOKEN, preferred: LOCK_PREFERRED, paragraphIds: [P1, P2] },
        ],
        sourceLanguage: source,
        targetLanguage: target,
      });
      assertGoldenPairLabels(plan.prompt, source, target);
      expect(plan.mode).toBe('term_violation');
    });

    it(`MALFORMED_OUTPUT ${pairTag}`, () => {
      const parsed = parser.parse('no protocol tags here');
      const qa = runLocalQa({
        parsed,
        sourceParagraphIds: [P1, P2],
        sourceParagraphs: genericBatch,
        sourceLanguage: source,
        targetLanguage: target,
      });
      const plan = buildRepairPlan({
        reason: 'MALFORMED_OUTPUT',
        qa,
        parsed,
        batchParagraphs: genericBatch,
        sourceLanguage: source,
        targetLanguage: target,
      });
      assertGoldenPairLabels(plan.prompt, source, target);
      expect(plan.retranslate).toBe(true);
    });

    it(`DELTA_ONLY ${pairTag}`, () => {
      const plan = buildRepairPlan({
        reason: 'MEMORY_JSON_INVALID',
        qa: {
          verdict: 'REPAIR_REQUIRED',
          passed: false,
          errors: [],
          warnings: [],
          infos: [],
          missingParagraphIds: [],
          duplicateParagraphIds: [],
          unknownParagraphIds: [],
          emptyParagraphIds: [],
          corruptParagraphIds: [],
          outOfOrder: false,
        },
        parsed: {
          status: 'recovered',
          translations: [
            { paragraphId: P1, text: 'A.' },
            { paragraphId: P2, text: 'B.' },
          ],
          termDeltas: [],
          memoryDeltas: [],
          warnings: [],
          recoveryUsed: true,
          protocolVersion: 2,
        },
        batchParagraphs: genericBatch,
        sourceLanguage: source,
        targetLanguage: target,
      });
      assertGoldenPairLabels(plan.prompt, source, target);
      expect(plan.mode).toBe('deltas_only');
      expect(plan.retranslate).toBe(false);
      expect(plan.prompt).toMatch(/Do NOT re-translate/i);
    });
  }
});
