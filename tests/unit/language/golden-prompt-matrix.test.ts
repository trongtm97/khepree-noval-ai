import { describe, expect, it } from 'vitest';
import {
  composeTranslationStyleRules,
  formatTranslationTaskHeader,
} from '@shared/constants/translation-style-model';
import {
  resolveTranslationPromptPolicy,
  resolveSourceLanguageRules,
  resolveTargetLanguageRules,
} from '@shared/constants/translation-prompt-policy';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import { buildBootstrapAnalysisPrompt } from '@main/bootstrap/bootstrap-prompt-builder';
import { buildFullNovelPreprocessPrompt } from '@main/bootstrap/full-novel-preprocess-prompts';
import type { BootstrapLocalPrepResult } from '@main/bootstrap/bootstrap-local-prep';
import type { MemoryContextDto } from '@shared/schemas/memory';
import {
  GOLDEN_LANGUAGE_PAIRS,
  assertGoldenPairLabels,
  assertNoUnrelatedLanguagePolicy,
} from '../../helpers/golden-prompt-assertions';

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

function bootstrapPrep(source: string, target: string): BootstrapLocalPrepResult {
  return {
    projectId: 'golden',
    sourceLanguage: source,
    targetLanguage: target,
    bookProfile: '# Book',
    translationRules: '# Rules',
    knownTerms: [],
    chapters: [{ chapterNumber: 1, title: 'Ch1', text: 'sample source' }],
    throughChapter: 1,
    chapterCountRequested: 10,
    chapterCountUsed: 1,
    characterBudget: 80_000,
    totalChars: 20,
  };
}

describe('Golden prompt matrix — TRANSLATE task header', () => {
  for (const [source, target] of GOLDEN_LANGUAGE_PAIRS) {
    it(`snapshot ${source} → ${target}`, () => {
      const header = formatTranslationTaskHeader({
        sourceLanguage: source,
        targetLanguage: target,
        styleLabel: 'balanced',
        range: 'chapter 1',
      });
      expect(header).toMatchSnapshot(`golden-task-header-${source}-${target}`);
      assertGoldenPairLabels(header, source, target);
    });
  }
});

describe('Golden prompt matrix — full TRANSLATE pack sections', () => {
  for (const [source, target] of GOLDEN_LANGUAGE_PAIRS) {
    it(`pack ${source} → ${target}`, () => {
      const { sections } = assemblePackSections({
        style: 'balanced',
        chapterNumbers: [1],
        criticalRules: composeTranslationStyleRules({
          style: 'balanced',
          sourceLanguage: source,
          targetLanguage: target,
        }),
        context: EMPTY_CONTEXT,
        sourceLines: ['[C000001:P000001] sample source line'],
        sourceLanguage: source,
        targetLanguage: target,
      });
      const combined = [
        sections.taskHeader,
        sections.criticalRules,
        sections.outputProtocol,
      ].join('\n');
      assertGoldenPairLabels(combined, source, target);
      expect(sections.outputProtocol).toContain('TARGET_LANGUAGE_TRANSLATION');
      expect(combined).toMatchSnapshot(`golden-translate-pack-${source}-${target}`);
    });
  }
});

describe('Golden prompt matrix — policy layers', () => {
  for (const [source, target] of GOLDEN_LANGUAGE_PAIRS) {
    it(`policy ${source} → ${target}`, () => {
      const policy = resolveTranslationPromptPolicy({
        sourceLanguage: source,
        targetLanguage: target,
        style: 'balanced',
      });
      expect(policy.sourceLanguage).toBe(source);
      expect(policy.targetLanguage).toBe(target);
      expect(policy.layers.source.join(' ')).toContain(
        resolveSourceLanguageRules(source)[0].slice(0, 8),
      );
      expect(policy.layers.target.join(' ')).toContain(
        resolveTargetLanguageRules(target)[0].slice(0, 8),
      );
      if (source === 'ja' && target === 'en') {
        expect(policy.layers.pairOverrides.join(' ')).toMatch(/Honorific/i);
      }
      if (source === 'zh-Hans' && target === 'vi') {
        expect(policy.layers.pairOverrides.join(' ')).toMatch(/Hán-Việt/i);
      }
      if (source === 'fr' && target === 'de') {
        expect(policy.rules.join(' ')).not.toMatch(/Hán-Việt/i);
      }
    });
  }
});

describe('Golden prompt matrix — BOOTSTRAP', () => {
  for (const [source, target] of GOLDEN_LANGUAGE_PAIRS) {
    it(`bootstrap ${source} → ${target}`, () => {
      const prompt = buildBootstrapAnalysisPrompt(bootstrapPrep(source, target));
      assertGoldenPairLabels(prompt, source, target, { requirePolicyTokens: false });
      expect(prompt).toContain('DO NOT TRANSLATE');
      expect(prompt).toMatchSnapshot(`golden-bootstrap-${source}-${target}`);
    });
  }
});

describe('Golden prompt matrix — FULL PREPROCESS', () => {
  for (const [source, target] of GOLDEN_LANGUAGE_PAIRS) {
    it(`preprocess ${source} → ${target}`, () => {
      const prompt = buildFullNovelPreprocessPrompt({
        projectTitle: 'Golden Novel',
        sourceLanguage: source,
        targetLanguage: target,
        partFileNames: ['NOVEL_PART_01.txt'],
      });
      assertGoldenPairLabels(prompt, source, target, { requirePolicyTokens: false });
    });
  }
});

describe('Negative static assertions', () => {
  it('ja → en: no Vietnamese / zh→vi hardcode', () => {
    const { sections } = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: composeTranslationStyleRules({
        style: 'balanced',
        sourceLanguage: 'ja',
        targetLanguage: 'en',
      }),
      context: EMPTY_CONTEXT,
      sourceLines: ['[C000001:P000001] 彼は走った。'],
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    });
    const prompt = `${sections.taskHeader}\n${sections.criticalRules}`;
    assertNoUnrelatedLanguagePolicy(prompt, 'ja', 'en');
    expect(prompt).not.toMatch(/Hán-Việt/i);
    expect(prompt).not.toMatch(/Vietnamese-specific/i);
    expect(prompt).not.toMatch(/Chinese\s*[→-]\s*Vietnamese/i);
  });

  it('ar → fr: no English/Vietnamese target instructions', () => {
    const { sections } = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: composeTranslationStyleRules({
        style: 'balanced',
        sourceLanguage: 'ar',
        targetLanguage: 'fr',
      }),
      context: EMPTY_CONTEXT,
      sourceLines: ['[C000001:P000001] مرحبا'],
      sourceLanguage: 'ar',
      targetLanguage: 'fr',
    });
    const prompt = `${sections.taskHeader}\n${sections.criticalRules}`;
    expect(prompt).not.toMatch(/natural Vietnamese dialogue/i);
    expect(prompt).not.toMatch(/Vietnamese-specific/i);
    expect(prompt).not.toMatch(/Translate.*Vietnamese/i);
    expect(prompt).toContain('French');
  });
});
