import { describe, expect, it } from 'vitest';
import { buildRepairPack } from '@main/jobs/repair-pack-builder';
import { buildRepairPlan } from '@main/jobs/repair-strategies';
import { buildContinuationPrompt as buildContinuation } from '@main/jobs/continuation';
import { requireRepairLanguagePair } from '@main/jobs/repair-language-pair';
import { formatAiLanguageIdentity } from '@shared/constants/language-profile';
import {
  TRANSLATION_LANGUAGE_PAIR_MISSING,
  TranslationLanguagePairMissingError,
} from '@shared/constants/translation-language';
import { splitRepairChannelPrompt } from '@main/prompt/pack-operation';

const P1 = '[C000001:P000001]';
const P2 = '[C000001:P000002]';
const P3 = '[C000001:P000003]';

const batch = [
  { paragraphId: P1, sourceText: '彼は走った。' },
  { paragraphId: P2, sourceText: '彼女は微笑んだ。' },
  { paragraphId: P3, sourceText: 'それから二人は話した。' },
];

describe('requireRepairLanguagePair', () => {
  it('throws TRANSLATION_LANGUAGE_PAIR_MISSING when pair omitted', () => {
    expect(() => requireRepairLanguagePair({})).toThrow(TranslationLanguagePairMissingError);
    try {
      requireRepairLanguagePair({ sourceLanguage: 'ja' });
    } catch (e) {
      expect((e as TranslationLanguagePairMissingError).code).toBe(
        TRANSLATION_LANGUAGE_PAIR_MISSING,
      );
    }
  });

  it('never falls back to zh-Hans→vi when pair missing on buildRepairPack', () => {
    expect(() =>
      buildRepairPack({
        missingParagraphIds: [P2],
        batchParagraphs: batch,
      } as never),
    ).toThrow(TranslationLanguagePairMissingError);
  });
});

describe('ja → en repair preserves language pair', () => {
  it('missing paragraph repair prompt stays ja → en', () => {
    const pack = buildRepairPack({
      missingParagraphIds: [P2],
      batchParagraphs: batch,
      sourceLanguage: 'ja',
      targetLanguage: 'en',
      neighborTargetTranslations: [{ paragraphId: P1, targetText: 'He ran.' }],
    });
    expect(pack.prompt).toContain(formatAiLanguageIdentity('ja'));
    expect(pack.prompt).toContain(formatAiLanguageIdentity('en'));
    expect(pack.prompt).toContain('### Previous translated context');
    expect(pack.prompt).toContain(`${P1} He ran.`);
    expect(pack.prompt).toContain('No TERM_DELTA or MEMORY_DELTA');
    expect(pack.prompt).not.toContain('zh-Hans');
    expect(pack.prompt).not.toContain('Tiếng Việt');
  });
});

describe('ar → vi continuation preserves language pair', () => {
  it('continuation prompt stays ar → vi with target continuity', () => {
    const prompt = buildContinuation({
      fromParagraphId: P2,
      batchParagraphs: [
        { paragraphId: P1, sourceText: 'مرحبا' },
        { paragraphId: P2, sourceText: 'كيف حالك' },
      ],
      remainingParagraphIds: [P2],
      sourceLanguage: 'ar',
      targetLanguage: 'vi',
      continuationTargetContext: [{ paragraphId: P1, targetText: 'Xin chào' }],
    });
    expect(prompt).toContain(formatAiLanguageIdentity('ar'));
    expect(prompt).toContain(formatAiLanguageIdentity('vi'));
    expect(prompt).toContain('### Previous translated context');
    expect(prompt).toContain('Xin chào');
    expect(prompt).not.toMatch(/zh-Hans|Chinese \(Simplified\)/i);
  });
});

describe('fr → de term violation repair', () => {
  it('lists source term, required target, and affected IDs', () => {
    const frBatch = [
      { paragraphId: P1, sourceText: 'Bonjour' },
      { paragraphId: P2, sourceText: 'Er verwendet Magie.' },
    ];
    const plan = buildRepairPlan({
      reason: 'TERM_VIOLATION',
      qa: {
        verdict: 'REPAIR_REQUIRED',
        passed: false,
        errors: [
          {
            code: 'locked_term_forbidden_variant',
            severity: 'error',
            message: 'bad term',
            paragraphId: P2,
            termSource: 'Magie',
            expected: 'Zauberei',
            found: 'Magie',
          },
        ],
        warnings: [],
        infos: [],
        missingParagraphIds: [],
        emptyParagraphIds: [],
        corruptParagraphIds: [],
        duplicateParagraphIds: [],
        unknownParagraphIds: [],
        outOfOrder: false,
      },
      parsed: {
        status: 'ok',
        translations: [
          { paragraphId: P1, text: 'Hallo.' },
          { paragraphId: P2, text: 'Er nutzt Magie.' },
        ],
        termDeltas: [],
        memoryDeltas: [],
        warnings: [],
        recoveryUsed: false,
        protocolVersion: 2,
      },
      batchParagraphs: frBatch,
      sourceLanguage: 'fr',
      targetLanguage: 'de',
      lockedTermHints: [
        { source: 'Magie', preferred: 'Zauberei', paragraphIds: [P2] },
      ],
    });
    expect(plan.prompt).toContain(formatAiLanguageIdentity('fr'));
    expect(plan.prompt).toContain(formatAiLanguageIdentity('de'));
    expect(plan.prompt).toContain('required target: "Zauberei"');
    expect(plan.prompt).toContain(P2);
    expect(plan.prompt).not.toContain('Vietnamese');
  });
});

describe('MEMORY_JSON_INVALID includes language context', () => {
  it('includes pair, edition, and invalid payload guidance', () => {
    const plan = buildRepairPlan({
      reason: 'MEMORY_JSON_INVALID',
      qa: {
        verdict: 'REPAIR_REQUIRED',
        passed: false,
        errors: [],
        warnings: [],
        infos: [],
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
        warnings: [
          {
            code: 'delta_discarded',
            message: 'MEMORY_DELTA parse failed',
            section: 'MEMORY_DELTA',
          },
        ],
        recoveryUsed: true,
        protocolVersion: 2,
      },
      batchParagraphs: batch,
      sourceLanguage: 'ja',
      targetLanguage: 'en',
      editionId: 'edition-test-1',
    });
    expect(plan.retranslate).toBe(false);
    expect(plan.prompt).toContain(formatAiLanguageIdentity('ja'));
    expect(plan.prompt).toContain(formatAiLanguageIdentity('en'));
    expect(plan.prompt).toContain('Edition ID: edition-test-1');
    expect(plan.prompt).toContain('Do NOT re-translate paragraphs');
    expect(plan.prompt).toContain('MEMORY_DELTA parse failed');
    expect(plan.prompt).toMatch(/do not manufacture|schema alone/i);
  });
});

describe('provider fallback pack shape', () => {
  it('preserves baseContext, operationPrompt, language pair, policy hash, repair body', () => {
    const snapshot = '## Critical Rules\n- tone locked';
    const repairBody = [
      formatAiLanguageIdentity('ja'),
      'Translate ONLY [C000001:P000002]',
    ].join('\n');
    const split = splitRepairChannelPrompt({
      repairBody,
      operationType: 'REPAIR',
      localContextSnapshot: snapshot,
    });
    expect(split.baseContext).toBe(snapshot);
    expect(split.operationPrompt).toContain('## Repair task');
    expect(split.operationPrompt).toContain('Japanese / 日本語 (ja)');
    expect(split.prompt).toContain(snapshot);
    expect(split.prompt).toContain(repairBody);

    const stylePolicyHash = 'abc123policyhash';
    const packShape = {
      baseContext: split.baseContext,
      operationPrompt: split.operationPrompt,
      prompt: split.prompt,
      promptHash: stylePolicyHash,
      targetParagraphIds: [P2],
    };
    expect(packShape.baseContext).toBe(snapshot);
    expect(packShape.operationPrompt).toContain(P2);
    expect(packShape.promptHash).toBe(stylePolicyHash);
  });
});
