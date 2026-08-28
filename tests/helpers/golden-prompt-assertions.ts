import { expect } from 'vitest';
import { getLanguageProfile, formatAiLanguageIdentity } from '@shared/constants/language-profile';
import {
  resolveSourceLanguageRules,
  resolveTargetLanguageRules,
  resolvePairOverrideRules,
} from '@shared/constants/translation-prompt-policy';

/** Phase 8 golden matrix — production language pairs. */
export const GOLDEN_LANGUAGE_PAIRS: ReadonlyArray<[string, string]> = [
  ['zh-Hans', 'vi'],
  ['zh-Hant', 'en'],
  ['ja', 'vi'],
  ['ja', 'en'],
  ['ko', 'vi'],
  ['ko', 'en'],
  ['en', 'vi'],
  ['en', 'es'],
  ['fr', 'de'],
  ['de', 'fr'],
  ['ru', 'vi'],
  ['uk', 'en'],
  ['ar', 'vi'],
  ['fa', 'en'],
  ['ur', 'vi'],
  ['hi', 'en'],
  ['th', 'vi'],
  ['id', 'en'],
];

const LEAK_ZH_VI =
  /Chinese\s*[→\-–—]\s*Vietnamese|Translate Chinese\s*[→\-–—]\s*Vietnamese|中文\s*[→\-–—]\s*越南/i;

export function assertGoldenPairLabels(
  prompt: string,
  sourceLanguage: string,
  targetLanguage: string,
  options?: { requirePolicyTokens?: boolean },
): void {
  const sourceProfile = getLanguageProfile(sourceLanguage);
  const targetProfile = getLanguageProfile(targetLanguage);

  expect(prompt).toContain(formatAiLanguageIdentity(sourceLanguage));
  expect(prompt).toContain(formatAiLanguageIdentity(targetLanguage));
  expect(prompt).toContain(`(${sourceLanguage})`);
  expect(prompt).toContain(`(${targetLanguage})`);
  expect(prompt).toContain(sourceProfile.internationalName);
  expect(prompt).toContain(targetProfile.internationalName);

  const requirePolicyTokens = options?.requirePolicyTokens ?? true;

  const sourceRules = resolveSourceLanguageRules(sourceLanguage);
  const targetRules = resolveTargetLanguageRules(targetLanguage);
  if (requirePolicyTokens && sourceRules.length > 0) {
    const token = sourceRules[0]!.split(/\s+/).find((w) => w.length > 5) ?? '';
    if (token) expect(prompt.toLowerCase()).toContain(token.slice(0, 6).toLowerCase());
  }
  if (requirePolicyTokens && targetRules.length > 0) {
    const token = targetRules[0]!.split(/\s+/).find((w) => w.length > 5) ?? '';
    if (token) expect(prompt.toLowerCase()).toContain(token.slice(0, 6).toLowerCase());
  }

  const pairRules = resolvePairOverrideRules(sourceLanguage, targetLanguage);
  if (requirePolicyTokens && pairRules.length > 0 && prompt.includes('## Critical Rules')) {
    expect(prompt).toContain(pairRules[0]!.slice(0, 12));
  }

  assertNoUnrelatedLanguagePolicy(prompt, sourceLanguage, targetLanguage);
}

export function assertNoUnrelatedLanguagePolicy(
  prompt: string,
  sourceLanguage: string,
  targetLanguage: string,
): void {
  expect(prompt).not.toMatch(LEAK_ZH_VI);

  if (targetLanguage !== 'vi') {
    expect(prompt).not.toMatch(/Hán-Việt/i);
  }

  if (targetLanguage !== 'vi') {
    expect(prompt).not.toMatch(/natural Vietnamese dialogue/i);
    expect(prompt).not.toMatch(/Vietnamese-specific/i);
  }

  if (targetLanguage !== 'en') {
    expect(prompt).not.toMatch(/English-specific target/i);
  }

  if (sourceLanguage !== 'ja' || targetLanguage !== 'en') {
    // ja→en honorific rules should not appear in unrelated pairs
    if (!prompt.includes(formatAiLanguageIdentity('ja'))) {
      expect(prompt).not.toMatch(/Honorific suffixes in Japanese/i);
    }
  }
}

export function pairFingerprint(prompt: string): string {
  const source =
    prompt.match(/Source language:\s*\n\s*[^\n]*\(([^)]+)\)/)?.[1] ??
    prompt.match(/Source language:[\s\S]*?\(([^)]+)\)/)?.[1] ??
    '';
  const target =
    prompt.match(/Target language:\s*\n\s*[^\n]*\(([^)]+)\)/)?.[1] ??
    prompt.match(/Target language:[\s\S]*?\(([^)]+)\)/)?.[1] ??
    '';
  return `${source}→${target}`;
}
