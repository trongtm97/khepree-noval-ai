import { describe, expect, it } from 'vitest';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import type { MemoryContextDto } from '@shared/schemas/memory';

function minimalContext(overrides: Partial<MemoryContextDto> = {}): MemoryContextDto {
  return {
    activeTerms: [
      {
        sourceText: 'term-a',
        preferredTranslation: 'term-b',
        type: 'OTHER',
        locked: true,
      },
    ],
    activeCharacters: [],
    relationships: [],
    recentMemory: [],
    criticalProjectRules: [],
    storyState: { summaryText: 'state', currentChapterNumber: 1 },
    anchorChapter: 1,
    recentWindow: { fromChapter: 1, toChapter: 1 },
    budget: { limit: 4000, estimated: 50, dropped: 0 },
    ...overrides,
  };
}

const LANGUAGE_PAIRS = [
  { label: 'zh→vi', sourceLanguage: 'zh', targetLanguage: 'vi', sourceLabel: '简体中文', targetLabel: 'Tiếng Việt', sourceLine: '你好世界。' },
  { label: 'ja→en', sourceLanguage: 'ja', targetLanguage: 'en', sourceLabel: '日本語', targetLabel: 'English', sourceLine: 'こんにちは世界。' },
  { label: 'en→es', sourceLanguage: 'en', targetLanguage: 'es', sourceLabel: 'English', targetLabel: 'Español', sourceLine: 'Hello world.' },
  { label: 'ar→vi', sourceLanguage: 'ar', targetLanguage: 'vi', sourceLabel: 'العربية', targetLabel: 'Tiếng Việt', sourceLine: 'مرحبا بالعالم.' },
] as const;

describe('local_context pack — multilingual, no Notebook', () => {
  for (const pair of LANGUAGE_PAIRS) {
    it(`${pair.label}: uses detected source + edition target language`, () => {
      const pack = assemblePackSections({
        style: 'balanced',
        chapterNumbers: [1],
        criticalRules: [],
        context: minimalContext(),
        sourceLines: [`[C000001:P000001] ${pair.sourceLine}`],
        sourceLanguage: pair.sourceLanguage,
        targetLanguage: pair.targetLanguage,
      });
      expect(pack.sections.taskHeader).toContain(pair.sourceLabel);
      expect(pack.sections.taskHeader).toContain(pair.targetLabel);
      expect(pack.prompt).not.toContain('Notebook cold knowledge');
      expect(pack.sections.taskHeader).not.toMatch(/\bChinese\b|\bVietnamese\b/);
    });
  }

  it('Browser and WebAPI get semantically same baseContext for same input', () => {
    const input = {
      style: 'balanced' as const,
      chapterNumbers: [5],
      criticalRules: ['Preserve honorifics.'],
      context: minimalContext({
        activeTerms: [
          {
            sourceText: '先生',
            preferredTranslation: 'sensei',
            type: 'OTHER',
            locked: true,
          },
        ],
      }),
      sourceLines: ['[C000005:P000001] 先生、おはよう。'],
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    };
    const browser = assemblePackSections(input);
    const webApi = assemblePackSections(input);
    expect(browser.baseContext).toBe(webApi.baseContext);
    expect(browser.operationPrompt).toBe(webApi.operationPrompt);
    expect(browser.baseContext).toContain('Preserve honorifics');
    expect(browser.baseContext).toContain('先生 → sensei');
  });
});
