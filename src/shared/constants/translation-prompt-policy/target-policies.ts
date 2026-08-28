import { formatAiLanguageIdentity, normalizeLanguageCode } from '../language-profile';

const GENERIC_TARGET_RULES: string[] = [
  'Write fluent, idiomatic prose in the target language.',
  'Dialogue should sound spoken in the target language, not like a word-for-word calque.',
  'Match punctuation and quotation conventions of the target language.',
];

/** Target writing policies — reused across any source→target pair. */
const TARGET_LANGUAGE_RULES: Record<string, string[]> = {
  vi: [
    'Vietnamese target: dialogue must sound natural Vietnamese, not stiff source-syntax calques.',
    'Pronouns and forms of address should follow relationship memory (a_calls_b / b_calls_a).',
    'Prefer established Sino-Vietnamese (Hán-Việt) readings for names/terms when locked terms allow.',
    'Avoid English or Chinese sentence skeletons in Vietnamese output.',
  ],
  en: [
    'English target: use natural contemporary prose unless the genre demands archaic register.',
    'Honorifics from CJK sources: keep, gloss, or transliterate consistently per Project Terms.',
    'Prefer clear subjects in English when the source omits them only if identity is recoverable from context.',
  ],
  ja: [
    'Japanese target: preserve honorific and speech-level nuance appropriate to Japanese dialogue.',
    'Use natural Japanese name order and particles; follow locked Project Terms for names.',
  ],
  ko: [
    'Korean target: maintain speech levels and honorific distance in dialogue.',
    'Use natural Korean address forms from relationship memory when available.',
  ],
  'zh-Hans': [
    'Simplified Chinese target: use consistent han terminology from locked Project Terms.',
    'Do not mix Traditional characters unless locked terms specify them.',
  ],
  'zh-Hant': [
    'Traditional Chinese target: use Traditional characters consistently per locked terms.',
  ],
  es: [
    'Spanish target: natural spoken dialogue; preserve gender agreement in target grammar.',
  ],
  fr: [
    'French target: natural register and liaison-friendly phrasing; keep titles consistent.',
  ],
  de: [
    'German target: preserve compound terminology; use natural German sentence structure.',
  ],
  pt: [
    'Portuguese target: natural dialogue; keep proper nouns exact unless locked terms specify.',
  ],
  ru: [
    'Russian target: natural case and aspect in target grammar; names per locked terms.',
  ],
  uk: [
    'Ukrainian target: natural case usage; follow locked name forms.',
  ],
  ar: [
    'Arabic target: respect RTL flow and formal/informal register from context.',
  ],
  fa: [
    'Persian target: preserve politeness level and natural Persian word order.',
  ],
  hi: [
    'Hindi target: respect honorifics and respectful address in dialogue.',
  ],
  th: [
    'Thai target: use appropriate politeness particles and natural Thai rhythm.',
  ],
  id: [
    'Indonesian target: natural informal/formal register matching the source tone.',
  ],
  ms: [
    'Malay target: natural spoken Malay; keep names and titles from locked terms.',
  ],
};

export function resolveTargetLanguageRules(targetLanguage: string): string[] {
  const code = normalizeLanguageCode(targetLanguage);
  const specific = TARGET_LANGUAGE_RULES[code];
  if (specific) return [...specific];
  const base = code.split('-')[0];
  const baseRules = TARGET_LANGUAGE_RULES[base];
  if (baseRules) return [...baseRules];
  return [
    ...GENERIC_TARGET_RULES,
    `Target language: ${formatAiLanguageIdentity(code)}.`,
  ];
}
