import { describe, expect, it } from 'vitest';
import { buildBootstrapAnalysisPrompt } from '../../../src/main/bootstrap/bootstrap-prompt-builder';
import { buildFullNovelPreprocessPrompt } from '../../../src/main/bootstrap/full-novel-preprocess-prompts';
import {
  parseBootstrapAnalysisOutput,
  preferredTargetOf,
} from '../../../src/shared/schemas/bootstrap';
import type { BootstrapLocalPrepResult } from '../../../src/main/bootstrap/bootstrap-local-prep';

const PAIRS = [
  ['zh-Hans', 'vi'],
  ['ja', 'vi'],
  ['en', 'es'],
] as const;

function prepFor(sourceLanguage: string, targetLanguage: string): BootstrapLocalPrepResult {
  return {
    projectId: 'p',
    sourceLanguage,
    targetLanguage,
    bookProfile: '# Book',
    translationRules: '# Rules',
    knownTerms: [],
    chapters: [{ chapterNumber: 1, title: 'Ch1', text: 'sample source text' }],
    throughChapter: 1,
    chapterCountRequested: 10,
    chapterCountUsed: 1,
    characterBudget: 80_000,
    totalChars: 20,
  };
}

describe('bootstrap / preprocess language pairs', () => {
  it.each(PAIRS)('bootstrap prompt %s → %s uses edition profile headers', (source, target) => {
    const prompt = buildBootstrapAnalysisPrompt(prepFor(source, target));
    expect(prompt).toContain('Source:');
    expect(prompt).toContain('Target edition:');
    expect(prompt).toContain(`(${source})`);
    expect(prompt).toContain(`(${target})`);
    expect(prompt).toContain('canonical_source_name');
    expect(prompt).toContain('preferred_target_name');
    expect(prompt).not.toMatch(/"preferred_vi"/);
    expect(prompt).not.toMatch(/Trung\s*→\s*Việt/i);
  });

  it.each(PAIRS)('full preprocess prompt %s → %s is pair-aware', (source, target) => {
    const prompt = buildFullNovelPreprocessPrompt({
      projectTitle: 'Pair Novel',
      author: 'A',
      genre: 'fantasy',
      partFileNames: ['NOVEL_PART_01.txt'],
      sourceLanguage: source,
      targetLanguage: target,
    });
    expect(prompt).toContain('Source:');
    expect(prompt).toContain('Target edition:');
    expect(prompt).toContain(`(${source})`);
    expect(prompt).toContain(`(${target})`);
    expect(prompt).toContain('preferred_target_name');
    expect(prompt).not.toMatch(/"preferred_vi"/);
    expect(prompt).not.toMatch(/Trung\s*→\s*Việt/i);
  });

  it('zh→vi regression: prompt still names language codes in profile headers', () => {
    const prompt = buildBootstrapAnalysisPrompt(prepFor('zh-Hans', 'vi'));
    expect(prompt).toMatch(/zh-Hans/i);
    expect(prompt).toMatch(/\(vi\)/i);
  });
});

describe('preferred_vi → preferred_target adapter', () => {
  it('accepts legacy preferred_vi on characters and terms', () => {
    const parsed = parseBootstrapAnalysisOutput(
      JSON.stringify({
        characters: [{ source_name: '王林', preferred_vi: 'Vương Lâm' }],
        relationships: [],
        terms: [{ source: '筑基', preferred_vi: 'Trúc Cơ', category: 'skill' }],
        world_knowledge: {},
        story_state: {},
        recent_context: {},
      }),
    );
    expect(parsed.characters).toHaveLength(1);
    expect(parsed.terms).toHaveLength(1);
    expect(preferredTargetOf(parsed.characters[0])).toBe('Vương Lâm');
    expect(preferredTargetOf(parsed.terms[0])).toBe('Trúc Cơ');
    expect(parsed.terms[0].preferred_target).toBe('Trúc Cơ');
  });

  it('accepts structured sourceText/targetText at parse boundary (legacy)', () => {
    const parsed = parseBootstrapAnalysisOutput(
      JSON.stringify({
        characters: [],
        relationships: [],
        terms: [
          {
            sourceText: 'sword',
            targetText: 'espada',
            sourceLanguage: 'en',
            targetLanguage: 'es',
            category: 'ITEM',
          },
        ],
        world_knowledge: {},
        story_state: {},
        recent_context: {},
      }),
    );
    expect(parsed.terms).toHaveLength(1);
    expect(parsed.terms[0].source).toBe('sword');
    expect(parsed.terms[0].preferred_target).toBe('espada');
    expect(parsed.terms[0].sourceLanguage).toBe('en');
    expect(parsed.terms[0].targetLanguage).toBe('es');
  });
});
