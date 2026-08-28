import { describe, expect, it } from 'vitest';
import {
  composeTranslationStyleRules,
  formatLanguagePairPreamble,
  formatTranslationTaskHeader,
  resolveLanguagePairRules,
  resolveProjectTranslationStyle,
  resolveStyleModel,
} from '@shared/constants/translation-style-model';
import { OUTPUT_PROTOCOL_BLOCK } from '@shared/constants/translation-pack';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import { buildRepairPack } from '@main/jobs/repair-pack-builder';
import { buildContinuationPrompt } from '@main/jobs/continuation';
import type { MemoryContextDto } from '@shared/schemas/memory';

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

const PAIRS: [string, string][] = [
  ['zh-Hans', 'vi'],
  ['en', 'vi'],
  ['ja', 'en'],
  ['vi', 'en'],
  ['es', 'vi'],
];

describe('style model: fidelity / genre / pair rules', () => {
  it('resolveProjectTranslationStyle reads style_config.preset', () => {
    expect(resolveProjectTranslationStyle(null)).toBe('balanced');
    expect(
      resolveProjectTranslationStyle(JSON.stringify({ preset: 'xianxia' })),
    ).toBe('xianxia');
    expect(
      resolveProjectTranslationStyle(JSON.stringify({ style: 'literal' })),
    ).toBe('literal');
  });

  it('maps legacy xianxia → BALANCED + XIANXIA without embedding Chinese language rules', () => {
    const m = resolveStyleModel('xianxia');
    expect(m.fidelity).toBe('BALANCED');
    expect(m.genre).toBe('XIANXIA');
    const rules = composeTranslationStyleRules({
      style: 'xianxia',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
    });
    expect(rules.some((r) => /cultivation/i.test(r))).toBe(true);
    expect(rules.every((r) => !/Chinese|Vietnamese|Hán-Việt/i.test(r))).toBe(true);
  });

  it('zh→vi pair rules include Hán-Việt policy; ja→en honorifics; en→vi dialogue', () => {
    expect(resolveLanguagePairRules('zh-Hans', 'vi').join(' ')).toMatch(/Hán-Việt/i);
    expect(resolveLanguagePairRules('ja', 'en').join(' ')).toMatch(/Honorific/i);
    expect(resolveLanguagePairRules('en', 'vi').join(' ')).toMatch(/dialogue/i);
    expect(resolveLanguagePairRules('ko', 'vi').join(' ')).toMatch(/address/i);
  });

  it('OUTPUT_PROTOCOL uses TARGET_LANGUAGE_TRANSLATION placeholder', () => {
    expect(OUTPUT_PROTOCOL_BLOCK).toContain('TARGET_LANGUAGE_TRANSLATION');
    expect(OUTPUT_PROTOCOL_BLOCK).not.toMatch(/Vietnamese translation/i);
  });
});

describe('translation task header snapshots (5 pairs)', () => {
  for (const [source, target] of PAIRS) {
    it(`${source} → ${target}`, () => {
      const header = formatTranslationTaskHeader({
        sourceLanguage: source,
        targetLanguage: target,
        styleLabel: 'balanced',
        range: 'chapter 1',
      });
      expect(header).toMatchSnapshot(`task-header-${source}-${target}`);
      expect(header).toContain('Source language:');
      expect(header).toContain('Target language:');
      expect(header).toContain('Translate:');
      expect(header).not.toMatch(/Translate Chinese → Vietnamese/i);
      expect(header).not.toMatch(/Chinese → Vietnamese/i);

      const { sections } = assemblePackSections({
        style: 'balanced',
        chapterNumbers: [1],
        criticalRules: [],
        context: EMPTY_CONTEXT,
        sourceLines: ['[C000001:P000001] sample'],
        sourceLanguage: source,
        targetLanguage: target,
      });
      expect(sections.taskHeader).toContain('Source language:');
      expect(sections.outputProtocol).toContain('TARGET_LANGUAGE_TRANSLATION');

      if (source === 'zh-Hans' && target === 'vi') {
        expect(sections.criticalRules).toMatch(/Hán-Việt/i);
      }
    });
  }
});

describe('repair / continuation preserve language pair', () => {
  for (const [source, target] of PAIRS) {
    it(`repair ${source} → ${target}`, () => {
      const pack = buildRepairPack({
        missingParagraphIds: ['C000001:P000001'],
        batchParagraphs: [
          { paragraphId: 'C000001:P000001', sourceText: 'hello' },
          { paragraphId: 'C000001:P000002', sourceText: 'world' },
        ],
        sourceLanguage: source,
        targetLanguage: target,
      });
      expect(pack.prompt).toMatchSnapshot(`repair-${source}-${target}`);
      expect(pack.prompt).toContain(formatLanguagePairPreamble(source, target).split('\n')[0]);
      expect(pack.prompt).toContain('TARGET_LANGUAGE_TRANSLATION');
      expect(pack.prompt).not.toMatch(/Vietnamese…|Vietnamese translation/i);
    });

    it(`continuation ${source} → ${target}`, () => {
      const prompt = buildContinuationPrompt({
        fromParagraphId: 'C000001:P000002',
        batchParagraphs: [
          { paragraphId: 'C000001:P000001', sourceText: 'a' },
          { paragraphId: 'C000001:P000002', sourceText: 'b' },
        ],
        remainingParagraphIds: ['C000001:P000002'],
        sourceLanguage: source,
        targetLanguage: target,
      });
      expect(prompt).toMatchSnapshot(`continuation-${source}-${target}`);
      expect(prompt).toContain('Target language:');
      expect(prompt).toContain('Continue from');
      expect(prompt).not.toMatch(/Tiếp tục từ|Không lặp lại đoạn đã dịch/);
      expect(prompt).not.toMatch(/Translate Chinese → Vietnamese/i);
    });
  }
});

describe('CN→VI regression', () => {
  it('zh-Hans→vi still gets pair rules + readable task header', () => {
    const header = formatTranslationTaskHeader({
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
      styleLabel: 'xianxia',
      range: 'chapters 1–3',
    });
    expect(header).toContain('简体中文');
    expect(header).toContain('Tiếng Việt');
    expect(header).toContain('Translate:');
    const rules = composeTranslationStyleRules({
      style: 'xianxia',
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
    });
    expect(rules.some((r) => /Hán-Việt/i.test(r))).toBe(true);
    expect(rules.some((r) => /cultivation/i.test(r))).toBe(true);
  });
});
