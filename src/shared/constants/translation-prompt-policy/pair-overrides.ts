import { normalizeLanguageCode } from '../language-profile';

export interface LanguagePairRuleSet {
  key: string;
  rules: string[];
}

/**
 * Layer G — pair-specific overrides only (not generic target naturalness).
 * Family keys (zh→vi) match any zh-* source when exact key misses.
 */
export const PAIR_OVERRIDE_RULES: LanguagePairRuleSet[] = [
  {
    key: 'zh→vi',
    rules: [
      'zh→vi: prefer established Hán-Việt (Sino-Vietnamese) readings for names and terms when locked terms allow.',
      'zh→vi: keep classical / cultivation titles consistent with Project Terms; do not freestyle Hán-Việt.',
    ],
  },
  {
    key: 'zh-Hans→vi',
    rules: [
      'zh-Hans→vi: source is Simplified Chinese; do not invent Traditional variants in the target.',
    ],
  },
  {
    key: 'zh-Hant→vi',
    rules: [
      'zh-Hant→vi: source is Traditional Chinese; preserve proper nouns via locked terms.',
    ],
  },
  {
    key: 'ja→en',
    rules: [
      'ja→en: honorifics (-san, -sama, -kun, -chan): keep or gloss consistently per Project Terms; do not drop without reason.',
      'ja→en: preserve name order policy from locked terms (family/given).',
    ],
  },
];

function languageFamily(code: string): string {
  const n = normalizeLanguageCode(code);
  if (n.startsWith('zh')) return 'zh';
  return n.split('-')[0] ?? n;
}

export function resolvePairOverrideRules(
  sourceLanguage: string,
  targetLanguage: string,
): string[] {
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);
  const exact = `${source}→${target}`;
  const family = `${languageFamily(source)}→${languageFamily(target)}`;
  const out: string[] = [];
  for (const set of PAIR_OVERRIDE_RULES) {
    if (set.key === exact || set.key === family) {
      out.push(...set.rules);
    }
  }
  return out;
}
