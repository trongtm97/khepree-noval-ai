/**
 * Translation style model — fidelity × genre × optional language-pair overrides.
 * Chinese-specific rules live ONLY in LanguagePairRules for zh→* pairs — never in core fidelity/genre.
 */

import { getLanguageProfile, normalizeLanguageCode } from './language-profile';

export const FIDELITY_PROFILES = ['LITERAL', 'BALANCED', 'NATURAL'] as const;
export type FidelityProfile = (typeof FIDELITY_PROFILES)[number];

export const GENRE_PROFILES = [
  'XIANXIA',
  'WUXIA',
  'ROMANCE',
  'URBAN',
  'FANTASY',
  'SCI_FI',
  'MYSTERY',
  'HORROR',
  'HISTORICAL',
  'LITERARY',
  'OTHER',
] as const;
export type GenreProfile = (typeof GENRE_PROFILES)[number];

export interface LanguagePairRuleSet {
  /** Match key: "zh-Hans→vi" or family "zh→vi" / "ja→en". */
  key: string;
  rules: string[];
}

/** Generic fidelity — no language-pair assumptions. */
export const FIDELITY_RULES: Record<FidelityProfile, string[]> = {
  LITERAL: [
    'Prefer literal accuracy over fluency.',
    'Keep source sentence order when the target language allows.',
    'Do not add unexplained cultural adaptation.',
  ],
  BALANCED: [
    'Balance accuracy and natural target-language readability.',
    'Preserve proper nouns via locked/active terms.',
    'Keep tone consistent with previous chapters.',
  ],
  NATURAL: [
    'Prioritize natural narration in the target language.',
    'Smooth awkward source syntax without inventing plot.',
    'Dialogue should sound spoken, not translated.',
  ],
};

/** Genre tone — language-agnostic. XIANXIA is genre, not "Chinese language". */
export const GENRE_RULES: Record<GenreProfile, string[]> = {
  XIANXIA: [
    'Use established cultivation terminology from active terms.',
    'Keep realm/technique names consistent; do not freestyle ranks.',
    'Preserve martial/cultivation tone; avoid modern slang.',
  ],
  WUXIA: [
    'Preserve martial brotherhood / sect etiquette from active terms.',
    'Keep technique and school names consistent.',
    'Maintain period wuxia register; avoid modern slang.',
  ],
  ROMANCE: [
    'Preserve emotional subtext and relationship nuance.',
    'Keep address terms (A calls B) consistent with memory.',
    'Do not flatten affection levels or conflict tension.',
  ],
  URBAN: [
    'Modern urban diction; keep names and brands exact.',
    'Prefer contemporary spoken style for dialogue.',
    'Avoid archaic cultivation phrasing.',
  ],
  FANTASY: [
    'Keep magic system / creature terms consistent with locked terms.',
    'Preserve worldbuilding proper nouns exactly as given.',
    'Do not invent lore beyond Notebook + pack context.',
  ],
  SCI_FI: [
    'Keep tech jargon and ship/org names consistent.',
    'Prefer precise terminology over poetic paraphrase for tech terms.',
    'Preserve timeline and tech-level cues.',
  ],
  MYSTERY: [
    'Do not reveal clues earlier than the source.',
    'Preserve ambiguity the narrator intends.',
    'Keep detective/procedural tone consistent.',
  ],
  HORROR: [
    'Preserve dread and sensory unease; do not sanitize.',
    'Keep creature/place names consistent.',
    'Avoid comic tone unless the source uses it.',
  ],
  HISTORICAL: [
    'Preserve period register; avoid anachronistic slang.',
    'Keep titles, ranks, and place names consistent with terms.',
    'Do not modernize social customs unless the source does.',
  ],
  LITERARY: [
    'Preserve stylistic voice and imagery where possible.',
    'Prefer elegant target prose without inventing plot.',
    'Keep motif and symbol wording consistent across chapters.',
  ],
  OTHER: [],
};

/**
 * Pair-specific overrides — NOT core fidelity/genre.
 * Family keys (zh→vi) match any zh-* source when exact key misses.
 */
export const LANGUAGE_PAIR_RULES: LanguagePairRuleSet[] = [
  {
    key: 'zh→vi',
    rules: [
      'Hán-Việt terminology: prefer established Sino-Vietnamese readings for names/terms when locked terms allow.',
      'Keep classical / cultivation titles consistent with Project Terms; do not freestyle Hán-Việt.',
    ],
  },
  {
    key: 'zh-Hans→vi',
    rules: [
      'Source is Simplified Chinese; do not invent Traditional variants in the target.',
    ],
  },
  {
    key: 'zh-Hant→vi',
    rules: [
      'Source is Traditional Chinese; preserve proper nouns via locked terms.',
    ],
  },
  {
    key: 'ja→en',
    rules: [
      'Honorifics (-san, -sama, -kun, -chan): keep or gloss consistently per Project Terms; do not drop without reason.',
      'Preserve name order policy from locked terms (family/given).',
    ],
  },
  {
    key: 'ko→vi',
    rules: [
      'Korean forms of address / speech levels: keep consistent with memory; do not flatten honorific distance.',
      'Name romanization must follow locked Project Terms.',
    ],
  },
  {
    key: 'en→vi',
    rules: [
      'Natural Vietnamese dialogue; avoid stiff calques from English syntax.',
      'Keep English proper nouns / brands exact unless a locked Vietnamese form exists.',
    ],
  },
];

export interface ResolvedStyleModel {
  fidelity: FidelityProfile;
  genre: GenreProfile;
  /** Legacy TranslationStyle string for telemetry / UI. */
  legacyStyle: string;
}

/** Map legacy TranslationStyle presets → fidelity + genre. */
export function resolveStyleModel(
  style: string | null | undefined,
): ResolvedStyleModel {
  const s = (style ?? 'balanced').toLowerCase();
  switch (s) {
    case 'literal':
      return { fidelity: 'LITERAL', genre: 'OTHER', legacyStyle: 'literal' };
    case 'natural':
      return { fidelity: 'NATURAL', genre: 'OTHER', legacyStyle: 'natural' };
    case 'xianxia':
      return { fidelity: 'BALANCED', genre: 'XIANXIA', legacyStyle: 'xianxia' };
    case 'urban':
      return { fidelity: 'BALANCED', genre: 'URBAN', legacyStyle: 'urban' };
    case 'romance':
      return { fidelity: 'BALANCED', genre: 'ROMANCE', legacyStyle: 'romance' };
    case 'wuxia':
      return { fidelity: 'BALANCED', genre: 'WUXIA', legacyStyle: 'wuxia' };
    case 'fantasy':
      return { fidelity: 'BALANCED', genre: 'FANTASY', legacyStyle: 'fantasy' };
    case 'sci_fi':
    case 'scifi':
      return { fidelity: 'BALANCED', genre: 'SCI_FI', legacyStyle: 'sci_fi' };
    case 'mystery':
      return { fidelity: 'BALANCED', genre: 'MYSTERY', legacyStyle: 'mystery' };
    case 'horror':
      return { fidelity: 'BALANCED', genre: 'HORROR', legacyStyle: 'horror' };
    case 'historical':
      return { fidelity: 'BALANCED', genre: 'HISTORICAL', legacyStyle: 'historical' };
    case 'literary':
      return { fidelity: 'BALANCED', genre: 'LITERARY', legacyStyle: 'literary' };
    case 'balanced':
    default:
      return { fidelity: 'BALANCED', genre: 'OTHER', legacyStyle: 'balanced' };
  }
}

function languageFamily(code: string): string {
  const n = normalizeLanguageCode(code);
  if (n.startsWith('zh')) return 'zh';
  return n.split('-')[0] ?? n;
}

export function resolveLanguagePairRules(
  sourceLanguage: string,
  targetLanguage: string,
): string[] {
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);
  const exact = `${source}→${target}`;
  const family = `${languageFamily(source)}→${languageFamily(target)}`;
  const out: string[] = [];
  for (const set of LANGUAGE_PAIR_RULES) {
    if (set.key === exact || set.key === family) {
      out.push(...set.rules);
    }
  }
  return out;
}

/** Compose prompt critical rules: fidelity → genre → pair overrides. */
export function composeTranslationStyleRules(input: {
  style?: string | null;
  fidelity?: FidelityProfile | null;
  genre?: GenreProfile | null;
  sourceLanguage: string;
  targetLanguage: string;
}): string[] {
  const resolved = resolveStyleModel(input.style);
  const fidelity = input.fidelity ?? resolved.fidelity;
  const genre = input.genre ?? resolved.genre;
  return [
    ...FIDELITY_RULES[fidelity],
    ...GENRE_RULES[genre],
    ...resolveLanguagePairRules(input.sourceLanguage, input.targetLanguage),
  ];
}

/** Prompt display name for a language code. */
export function languageDisplayName(code: string): string {
  return getLanguageProfile(code).displayNameNative;
}

/**
 * Canonical translation task header — never hardcodes Chinese/Vietnamese.
 */
export function formatTranslationTaskHeader(input: {
  sourceLanguage: string;
  targetLanguage: string;
  styleLabel?: string;
  range: string;
}): string {
  const sourceName = languageDisplayName(input.sourceLanguage);
  const targetName = languageDisplayName(input.targetLanguage);
  const lines = [
    '## Task',
    'Source language:',
    sourceName,
    '',
    'Target language:',
    targetName,
    '',
    'Translate:',
    `${sourceName} → ${targetName}`,
  ];
  if (input.styleLabel) {
    lines.push('', `Style: ${input.styleLabel}`);
  }
  lines.push(`Range: ${input.range}`);
  lines.push('Preserve every paragraph ID from Source exactly.');
  return lines.join('\n');
}

/** Short pair line for repair / continuation preamble. */
export function formatLanguagePairPreamble(
  sourceLanguage: string,
  targetLanguage: string,
): string {
  const sourceName = languageDisplayName(sourceLanguage);
  const targetName = languageDisplayName(targetLanguage);
  return [
    `Source language: ${sourceName} (${normalizeLanguageCode(sourceLanguage)})`,
    `Target language: ${targetName} (${normalizeLanguageCode(targetLanguage)})`,
    `Translate: ${sourceName} → ${targetName}`,
  ].join('\n');
}
