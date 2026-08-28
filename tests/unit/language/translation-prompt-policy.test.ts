import { describe, expect, it } from 'vitest';
import {
  resolveTranslationPromptPolicy,
  TranslationPromptPolicyResolver,
  resolveSourceLanguageRules,
  resolveTargetLanguageRules,
} from '@shared/constants/translation-prompt-policy';

const SNAPSHOT_PAIRS: [string, string][] = [
  ['zh-Hans', 'vi'],
  ['zh-Hans', 'en'],
  ['ja', 'vi'],
  ['ja', 'en'],
  ['ko', 'vi'],
  ['ko', 'en'],
  ['ar', 'en'],
  ['en', 'ar'],
  ['fr', 'de'],
  ['de', 'fr'],
  ['ru', 'vi'],
  ['vi', 'en'],
];

function policyText(source: string, target: string): string {
  const p = resolveTranslationPromptPolicy({
    sourceLanguage: source,
    targetLanguage: target,
    style: 'balanced',
  });
  return [
    '--- universal ---',
    p.layers.universal.join('\n'),
    '--- fidelity ---',
    p.layers.fidelity.join('\n'),
    '--- genre ---',
    p.layers.genre.join('\n'),
    '--- source ---',
    p.layers.source.join('\n'),
    '--- target ---',
    p.layers.target.join('\n'),
    '--- typography ---',
    p.layers.typography.join('\n'),
    '--- pairOverrides ---',
    p.layers.pairOverrides.join('\n'),
    '--- rules ---',
    p.rules.join('\n'),
  ].join('\n');
}

describe('TranslationPromptPolicyResolver', () => {
  it('exports alias resolve()', () => {
    const p = TranslationPromptPolicyResolver.resolve({
      sourceLanguage: 'ja',
      targetLanguage: 'en',
      style: 'balanced',
    });
    expect(p.sourceLanguage).toBe('ja');
    expect(p.targetLanguage).toBe('en');
    expect(p.rules.length).toBeGreaterThan(10);
  });

  it('does not invent lore via Notebook wording', () => {
    const fantasy = resolveTranslationPromptPolicy({
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      style: 'fantasy',
    });
    const joined = fantasy.rules.join(' ');
    expect(joined).toMatch(/supplied project\/local context/i);
    expect(joined).not.toMatch(/Notebook/i);
  });

  for (const [source, target] of SNAPSHOT_PAIRS) {
    it(`snapshot ${source} → ${target}`, () => {
      expect(policyText(source, target)).toMatchSnapshot(`${source}-${target}`);
    });
  }
});

describe('source policy reuse across targets', () => {
  const jaVi = resolveSourceLanguageRules('ja');
  const jaEn = resolveSourceLanguageRules('ja');
  const jaFr = resolveSourceLanguageRules('ja');

  it('ja source rules identical for vi, en, fr targets', () => {
    expect(jaVi).toEqual(jaEn);
    expect(jaEn).toEqual(jaFr);
    expect(jaVi.join(' ')).toMatch(/honorific|speech level/i);
    expect(jaVi.join(' ')).toMatch(/omit/i);
  });

  it('zh source does not appear in en target policy', () => {
    const enTarget = resolveTargetLanguageRules('en').join(' ');
    expect(enTarget).not.toMatch(/Hán-Việt|Simplified Chinese|简体中文/i);
  });
});

describe('target policy reuse across sources', () => {
  it('vi target shared by zh, en, ko sources', () => {
    const vi = resolveTargetLanguageRules('vi');
    expect(vi.join(' ')).toMatch(/natural Vietnamese/i);
    expect(vi.join(' ')).toMatch(/pronoun|address/i);
    const zhVi = resolveTranslationPromptPolicy({
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
    });
    const enVi = resolveTranslationPromptPolicy({
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    expect(zhVi.layers.target).toEqual(enVi.layers.target);
  });

  it('Vietnamese rules do not leak to non-vi targets', () => {
    const jaEn = resolveTranslationPromptPolicy({
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    });
    const joined = jaEn.rules.join(' ');
    expect(joined).not.toMatch(/natural Vietnamese|Hán-Việt|Tiếng Việt/i);
    expect(joined).toMatch(/honorific/i);
  });
});

describe('pair overrides are pair-specific only', () => {
  it('Hán-Việt only for zh→vi, not zh→en', () => {
    const zhVi = resolveTranslationPromptPolicy({
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
    });
    const zhEn = resolveTranslationPromptPolicy({
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'en',
    });
    expect(zhVi.layers.pairOverrides.join(' ')).toMatch(/Hán-Việt|zh→vi|zh-Hans→vi/i);
    expect(zhEn.layers.pairOverrides.length).toBe(0);
    expect(zhEn.rules.join(' ')).not.toMatch(/Hán-Việt/i);
  });

  it('ja→en honorific pair override not applied to ja→vi', () => {
    const jaEn = resolveTranslationPromptPolicy({
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    });
    const jaVi = resolveTranslationPromptPolicy({
      sourceLanguage: 'ja',
      targetLanguage: 'vi',
    });
    expect(jaEn.layers.pairOverrides.join(' ')).toMatch(/ja→en|Honorific/i);
    expect(jaVi.layers.pairOverrides.length).toBe(0);
  });
});

describe('universal translation contract', () => {
  it('includes fidelity, mixed-language, paragraph, and response-length rules', () => {
    const p = resolveTranslationPromptPolicy({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      style: 'balanced',
    });
    const u = p.layers.universal.join(' ');
    expect(u).toMatch(/faithfully into the target language/i);
    expect(u).toMatch(/another language/i);
    expect(u).toMatch(/Never translate or modify: paragraph IDs/i);
    expect(u).toMatch(/targetProfile\.quoteStyle/i);
    expect(u).toMatch(/one physical output line per ID/i);
    expect(u).toMatch(/Do not repeat the source text/i);
  });
});

describe('layer order and dedupe', () => {
  it('merges project and edition rules last', () => {
    const p = resolveTranslationPromptPolicy({
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      style: 'balanced',
      projectRules: ['Project rule alpha'],
      editionRules: ['Edition rule beta', 'Project rule alpha'],
    });
    expect(p.rules.at(-1)).toBe('Edition rule beta');
    expect(p.rules.filter((r) => r === 'Project rule alpha').length).toBe(1);
  });
});
