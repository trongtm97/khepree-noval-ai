import { describe, expect, it } from 'vitest';
import { buildBootstrapAnalysisPrompt } from '../../../src/main/bootstrap/bootstrap-prompt-builder';
import { buildFullNovelPreprocessPrompt } from '../../../src/main/bootstrap/full-novel-preprocess-prompts';
import {
  parseBootstrapAnalysisOutput,
  preferredTargetOf,
} from '../../../src/shared/schemas/bootstrap';
import { parseTermDelta } from '../../../src/shared/schemas/term-delta';
import type { BootstrapLocalPrepResult } from '../../../src/main/bootstrap/bootstrap-local-prep';

/** Phase 6 matrix — no Chinese/Vietnamese-centric hardcode in prompts. */
const PHASE6_PAIRS = [
  ['ja', 'en'],
  ['ko', 'vi'],
  ['ar', 'fr'],
  ['en', 'es'],
] as const;

const LEGACY_PAIR = ['zh-Hans', 'vi'] as const;

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

function assertPhase6PromptShape(prompt: string, source: string, target: string): void {
  expect(prompt).toContain('Source:');
  expect(prompt).toContain('Target edition:');
  expect(prompt).toContain(`(${source})`);
  expect(prompt).toContain(`(${target})`);
  expect(prompt).toContain('canonical_source_name');
  expect(prompt).toContain('preferred_target_name');
  expect(prompt).toContain('gender_if_explicit');
  expect(prompt).toContain('edition-scoped');
  expect(prompt).toContain('evidence_chapter');
  expect(prompt).not.toMatch(/"preferred_vi"/);
  expect(prompt).not.toMatch(/Trung\s*→\s*Việt|中文→Tiếng Việt/i);
  expect(prompt).not.toMatch(/For every term: sourceLanguage=/);
}

function assertPhase6PreprocessPromptShape(prompt: string, source: string, target: string): void {
  expect(prompt).toContain('Source:');
  expect(prompt).toContain('Target edition:');
  expect(prompt).toContain(`(${source})`);
  expect(prompt).toContain(`(${target})`);
  expect(prompt).toContain('preferred_target_name');
  expect(prompt).toContain('edition-scoped');
  expect(prompt).not.toMatch(/"preferred_vi"/);
}

describe('bootstrap delta model — Phase 6 pairs', () => {
  it.each(PHASE6_PAIRS)('bootstrap prompt %s → %s', (source, target) => {
    const prompt = buildBootstrapAnalysisPrompt(prepFor(source, target));
    assertPhase6PromptShape(prompt, source, target);
    expect(prompt).toContain('transliteration');
    expect(prompt).toMatch(/NOT emit sourceLanguage/i);
    expect(prompt).toContain('a_calls_b');
    expect(prompt).toContain('valid_to_chapter');
  });

  it.each(PHASE6_PAIRS)('full preprocess prompt %s → %s', (source, target) => {
    const prompt = buildFullNovelPreprocessPrompt({
      projectTitle: 'Pair Novel',
      author: 'A',
      genre: 'fantasy',
      partFileNames: ['NOVEL_PART_01.txt'],
      sourceLanguage: source,
      targetLanguage: target,
    });
    assertPhase6PreprocessPromptShape(prompt, source, target);
  });

  it('zh→vi legacy pair still resolves via language profiles (not hardcoded pair string)', () => {
    const [source, target] = LEGACY_PAIR;
    const prompt = buildBootstrapAnalysisPrompt(prepFor(source, target));
    expect(prompt).toContain(`(${source})`);
    expect(prompt).toContain(`(${target})`);
    expect(prompt).not.toMatch(/"preferred_vi"/);
  });
});

describe('bootstrap schema — story facts vs edition layer', () => {
  it('accepts canonical_source_name + preferred_target_name', () => {
    const parsed = parseBootstrapAnalysisOutput(
      JSON.stringify({
        characters: [
          {
            canonical_source_name: '田中',
            source_aliases: ['タナカ'],
            preferred_target_name: 'Tanaka',
            gender_if_explicit: null,
            first_seen_chapter: 1,
            confidence: 0.9,
            evidence_chapter: 1,
            evidence_source_name: '田中',
          },
        ],
        relationships: [
          {
            character_a: '田中',
            character_b: '佐藤',
            relationship_type: 'colleague',
            description: 'same department',
            valid_from_chapter: 1,
            a_calls_b: 'Sato-san',
            b_calls_a: 'Tanaka',
          },
        ],
        terms: [
          {
            source: '剣',
            preferred_target: 'sword',
            category: 'item',
            transliteration: 'ken',
            transliterationSystem: 'romaji',
          },
        ],
        world_knowledge: {},
        story_state: {},
        recent_context: {},
      }),
    );
    expect(parsed.characters[0].source_name).toBe('田中');
    expect(preferredTargetOf(parsed.characters[0])).toBe('Tanaka');
    expect(parsed.characters[0].gender).toBeNull();
    expect(parsed.relationships[0].description).toBe('same department');
    expect(parsed.relationships[0].a_calls_b).toBe('Sato-san');
    expect(parsed.terms[0].transliteration).toBe('ken');
  });

  it('unknown gender stays null — no inference field required', () => {
    const parsed = parseBootstrapAnalysisOutput(
      JSON.stringify({
        characters: [
          { canonical_source_name: 'Alex', gender_if_explicit: 'unknown' },
        ],
        relationships: [],
        terms: [],
        world_knowledge: {},
        story_state: {},
        recent_context: {},
      }),
    );
    expect(parsed.characters[0].gender).toBeNull();
  });

  it('accepts legacy preferred_vi at parse boundary only', () => {
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
    expect(preferredTargetOf(parsed.characters[0])).toBe('Vương Lâm');
    expect(preferredTargetOf(parsed.terms[0])).toBe('Trúc Cơ');
  });
});

describe('TERM_DELTA transliteration', () => {
  it('maps legacy reading to transliteration', () => {
    const items = parseTermDelta([
      {
        action: 'discover',
        source: '洛阳',
        target: 'Luoyang',
        reading: 'Luòyáng',
        category: 'place',
      },
    ]);
    expect(items[0].action).toBe('discover');
    if (items[0].action === 'discover') {
      expect(items[0].transliteration).toBe('Luòyáng');
    }
  });
});
