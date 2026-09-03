import { normalizeLanguageCode } from '../language-profile';

export const SOURCE_POLICY_FAMILIES = [
  'CJK',
  'GERMANIC',
  'ROMANCE',
  'SLAVIC',
  'ARABIC_SCRIPT',
  'INDIC',
  'TURKIC',
  'GENERIC',
] as const;

export type SourcePolicyFamily = (typeof SOURCE_POLICY_FAMILIES)[number];

const FAMILY_RULES: Record<SourcePolicyFamily, string[]> = {
  CJK: [
    'Source may omit subjects and rely on context; do not invent pronouns when identity is ambiguous.',
    'Preserve honorifics, speech level, and social distance cues implied in the source.',
    'Keep name order and segmentation consistent with locked Project Terms.',
  ],
  GERMANIC: [
    'Preserve explicit subjects and tense/aspect as stated in the source.',
    'Keep proper nouns and titles exact unless a locked target form exists.',
  ],
  ROMANCE: [
    'Preserve gender and agreement cues carried by the source wording.',
    'Keep titles, ranks, and formal address consistent with memory.',
  ],
  SLAVIC: [
    'Preserve aspect and case information where the source encodes it.',
    'Keep name variants and patronymic forms per locked Project Terms.',
  ],
  ARABIC_SCRIPT: [
    'Preserve gender/number agreement and register (formal vs colloquial) from the source.',
    'Handle embedded religious or cultural expressions faithfully; do not secularize unless the source does.',
    'Keep personal names and titles consistent with locked terms.',
  ],
  INDIC: [
    'Respect honorifics and respectful address forms present in the source.',
    'Do not flatten register or social distance implied by the source.',
  ],
  TURKIC: [
    'Preserve vowel harmony and agglutinative boundaries when choosing target wording.',
    'Keep titles and kinship terms consistent with locked Project Terms.',
  ],
  GENERIC: [
    'Read the source for what it states; do not add unstated facts or clarifications.',
    'Preserve semantic ambiguity when the source leaves identity or reference unclear.',
  ],
};

/** Language-specific source interpretation — wins over family rules. */
const LANGUAGE_SOURCE_RULES: Record<string, string[]> = {
  'zh-Hans': [
    'Simplified Chinese source: implicit subjects and aspect are common; do not over-explicitize.',
    'Treat idioms and chengyu by meaning; avoid literal calques unless locked terms require a form.',
    'Classical or cultivation titles: use locked Project Terms; do not freestyle readings.',
    'Segment names and titles per locked terms; do not merge or split han compounds arbitrarily.',
  ],
  'zh-Hant': [
    'Traditional Chinese source: same interpretation discipline as Simplified; script is Traditional.',
    'Preserve classical register when the source uses it; do not modernize diction unless the source does.',
  ],
  'zh-HK': [
    'Hong Kong Chinese source: respect local title and name forms from locked Project Terms.',
  ],
  ja: [
    'Japanese source: subjects may be omitted; do not invent pronouns when the source leaves identity ambiguous.',
    'Honorifics and speech level (-san, -sama, -kun, -chan, keigo) carry social meaning — preserve nuance.',
    'Preserve name order policy from locked terms (family/given).',
    'Onomatopoeia and affect particles: convey tone in the target without inventing plot.',
  ],
  ko: [
    'Korean source: speech levels and honorifics encode social distance — preserve relative status.',
    'Subjects may be omitted; do not invent pronouns when identity is ambiguous.',
    'Name and address forms must follow locked Project Terms and relationship memory.',
  ],
  ar: [
    'Arabic source: gender and number agreement in the source should inform target wording.',
    'Religious or cultural formulas: translate faithfully; do not omit or modernize without source support.',
  ],
  fa: [
    'Persian source: register and politeness markers matter; preserve distance between speakers.',
  ],
  ru: [
    'Russian source: aspect and case information should inform target phrasing where relevant.',
    'Patronymics and name variants: follow locked Project Terms.',
  ],
  uk: [
    'Ukrainian source: aspect and case cues should inform target phrasing where relevant.',
    'Name variants: follow locked Project Terms.',
  ],
  hi: [
    'Hindi source: respect honorifics and respectful address in dialogue.',
  ],
  th: [
    'Thai source: particles and politeness markers carry social meaning — preserve register.',
  ],
  en: [
    'English source: preserve tense, modality, and explicit references as written.',
  ],
};

function languageFamily(code: string): string {
  const n = normalizeLanguageCode(code);
  if (n.startsWith('zh')) return 'zh';
  return n.split('-')[0] ?? n;
}

export function resolveSourcePolicyFamily(code: string): SourcePolicyFamily {
  const n = normalizeLanguageCode(code);
  const base = languageFamily(n);
  if (n.startsWith('zh') || base === 'ja' || base === 'ko') return 'CJK';
  if (['en', 'de', 'nl', 'sv', 'no', 'da', 'af'].includes(base)) return 'GERMANIC';
  if (['fr', 'es', 'pt', 'it', 'ro', 'ca'].includes(base)) return 'ROMANCE';
  if (['ru', 'uk', 'pl', 'cs', 'bg', 'sr', 'hr', 'sk'].includes(base)) return 'SLAVIC';
  if (['ar', 'fa', 'he', 'ur', 'ps'].includes(base)) return 'ARABIC_SCRIPT';
  if (['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml'].includes(base)) return 'INDIC';
  if (['tr', 'az', 'uz', 'kk', 'ky'].includes(base)) return 'TURKIC';
  return 'GENERIC';
}

export function resolveSourceLanguageRules(sourceLanguage: string): string[] {
  const code = normalizeLanguageCode(sourceLanguage);
  const base = code.split('-')[0];
  const family = resolveSourcePolicyFamily(code);
  const rules =
    (code in LANGUAGE_SOURCE_RULES ? LANGUAGE_SOURCE_RULES[code] : undefined) ??
    (base in LANGUAGE_SOURCE_RULES ? LANGUAGE_SOURCE_RULES[base] : undefined) ??
    [];
  return [...rules, ...FAMILY_RULES[family]];
}
