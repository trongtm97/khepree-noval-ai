/**
 * Translation style model — fidelity × genre × optional language-pair overrides.
 * Chinese-specific rules live ONLY in LanguagePairRules for zh→* pairs — never in core fidelity/genre.
 */

import {
  formatAiLanguageIdentityFromProfile,
  formatTargetScriptMetadataLines,
  getLanguageProfile,
} from './language-profile';
import { resolvePairOverrideRules } from './translation-prompt-policy/pair-overrides';
import { resolveTranslationPromptPolicy } from './translation-prompt-policy/resolver';

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
    'Do not invent lore beyond the supplied project/local context.',
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
 * @deprecated Prefer resolvePairOverrideRules from translation-prompt-policy.
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

export function resolveLanguagePairRules(
  sourceLanguage: string,
  targetLanguage: string,
): string[] {
  return resolvePairOverrideRules(sourceLanguage, targetLanguage);
}

/** Compose prompt critical rules via layered TranslationPromptPolicy. */
export function composeTranslationStyleRules(input: {
  style?: string | null;
  fidelity?: FidelityProfile | null;
  genre?: GenreProfile | null;
  sourceLanguage: string;
  targetLanguage: string;
  projectRules?: string[];
  editionRules?: string[];
}): string[] {
  return resolveTranslationPromptPolicy({
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    style: input.style,
    fidelity: input.fidelity,
    genre: input.genre,
    projectRules: input.projectRules,
    editionRules: input.editionRules,
  }).rules;
}

/** Resolve translation style preset from project_settings.style_config JSON. */
export function resolveProjectTranslationStyle(
  styleConfigJson: string | null | undefined,
): string {
  if (!styleConfigJson?.trim()) return 'balanced';
  try {
    const parsed = JSON.parse(styleConfigJson) as {
      preset?: string;
      style?: string;
    };
    const candidate = (parsed.preset ?? parsed.style ?? '').trim();
    if (!candidate) return 'balanced';
    return resolveStyleModel(candidate).legacyStyle;
  } catch {
    return 'balanced';
  }
}

/** Prompt display name for a language code (AI identity line). */
export function languageDisplayName(code: string): string {
  return formatAiLanguageIdentityFromProfile(getLanguageProfile(code));
}

/**
 * Canonical translation task header — International / Native (BCP-47); never hardcodes pair labels.
 */
export function formatTranslationTaskHeader(input: {
  sourceLanguage: string;
  targetLanguage: string;
  styleLabel?: string;
  range: string;
  /** When source detection flagged embedded foreign material. */
  sourceMixedLanguage?: boolean;
}): string {
  const source = getLanguageProfile(input.sourceLanguage);
  const target = getLanguageProfile(input.targetLanguage);
  const sourceLabel = formatAiLanguageIdentityFromProfile(source);
  const targetLabel = formatAiLanguageIdentityFromProfile(target);

  const lines = [
    '## Task',
    'Source language:',
    sourceLabel,
    '',
    'Detected from source content.',
    '',
    'Target language:',
    targetLabel,
    '',
    'This is the required output language.',
  ];

  const scriptMeta = formatTargetScriptMetadataLines(target);
  if (scriptMeta.length) {
    lines.push('', ...scriptMeta);
  }

  if (input.sourceMixedLanguage) {
    lines.push(
      '',
      'The source contains embedded material in additional languages.',
      `Treat primary language as ${source.internationalName}, but interpret each embedded segment according to its actual language.`,
    );
  }

  lines.push('', 'Translate:', `${sourceLabel} → ${targetLabel}`);

  if (input.styleLabel) {
    lines.push('', `Style: ${input.styleLabel}`);
  }
  lines.push(`Range: ${input.range}`);
  lines.push('Preserve every paragraph ID from Source exactly.');
  return lines.join('\n');
}

/** Short pair block for repair / continuation preamble. */
export function formatLanguagePairPreamble(
  sourceLanguage: string,
  targetLanguage: string,
  options?: { sourceMixedLanguage?: boolean },
): string {
  const source = getLanguageProfile(sourceLanguage);
  const target = getLanguageProfile(targetLanguage);
  const sourceLabel = formatAiLanguageIdentityFromProfile(source);
  const targetLabel = formatAiLanguageIdentityFromProfile(target);

  const lines = [
    'Source language:',
    sourceLabel,
    '',
    'Detected from source content.',
    '',
    'Target language:',
    targetLabel,
    '',
    'This is the required output language.',
  ];

  const scriptMeta = formatTargetScriptMetadataLines(target);
  if (scriptMeta.length) {
    lines.push('', ...scriptMeta);
  }

  if (options?.sourceMixedLanguage) {
    lines.push(
      '',
      'The source contains embedded material in additional languages.',
      `Treat primary language as ${source.internationalName}, but interpret each embedded segment according to its actual language.`,
    );
  }

  lines.push('', 'Translate:', `${sourceLabel} → ${targetLabel}`);
  return lines.join('\n');
}
