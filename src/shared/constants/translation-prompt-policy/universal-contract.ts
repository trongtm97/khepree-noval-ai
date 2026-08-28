/**
 * Layer A — universal translation contract (all language pairs).
 * Language-specific policies are applied after this layer.
 */

export const UNIVERSAL_TRANSLATION_CONTRACT_RULES: string[] = [
  'Translate meaning faithfully into the target language.',
  'Preserve tone, intent, ambiguity, and narrative viewpoint.',
  'Do not add facts, explanations, or plot not present in the source or supplied context.',
  'Do not omit meaningful content.',
  'Produce natural target-language prose according to the selected fidelity profile.',
  'Locked terminology has absolute priority over model guesses.',
  'Preserve stable paragraph IDs exactly as given in Source.',
  'Output no commentary outside the required protocol sections.',
  'Do not mention being an AI or explain translation choices.',
  'Use Local Context (characters, relationships, story state, terms) when present; do not contradict locked facts.',
];

export const UNIVERSAL_MIXED_LANGUAGE_RULES: string[] = [
  'Primary detected source language is contextual guidance — not every token belongs to that language.',
  'When the source contains another language: understand it in context.',
  'Translate natural-language foreign content into the target when appropriate.',
  'Preserve proper names, brands, URLs, code, and identifiers as non-translatable when appropriate.',
  'Follow locked Project Terms; do not "correct" foreign phrases without evidence from context or terms.',
];

export const UNIVERSAL_NON_TRANSLATABLE_RULES: string[] = [
  'Never translate or modify: paragraph IDs, URLs, file paths, code identifiers, markup control tokens, structured placeholders.',
  'Preserve exact numbers when the source requires numeric fidelity.',
  'Preserve user-locked strings exactly.',
  'Do not over-generalize — normal prose in the target language should read naturally.',
];

export const UNIVERSAL_PUNCTUATION_PRINCIPLE: string[] = [
  'By default, adapt punctuation and quote style to the target language (targetProfile.quoteStyle, targetProfile.punctuationProfile).',
  'Unless a project rule explicitly requires preserving original source typography.',
];

export const UNIVERSAL_TARGET_SCRIPT_RULES: string[] = [
  'Translation prose should normally use the target language\'s expected script.',
  'Exceptions: proper names, locked terms, foreign quotations intentionally preserved, code, and URLs.',
];

export const UNIVERSAL_PARAGRAPH_CONTRACT_RULES: string[] = [
  'Exactly one output record per source paragraph ID.',
  'Translation text may use normal target-language punctuation inside the line.',
  'Because the parser is line-oriented: each translation MUST be one physical output line per ID.',
  'If the source contains internal line breaks, they were normalized before prompt building — do not invent new paragraph IDs.',
];

export const UNIVERSAL_RESPONSE_LENGTH_RULES: string[] = [
  'Do not repeat the source text in your response.',
  'Do not provide explanations or meta-commentary — protocol sections only.',
  'This reduces token usage and truncation risk.',
];

/** Full Layer A bundle for policy resolver. */
export const UNIVERSAL_TRANSLATION_CONTRACT: string[] = [
  ...UNIVERSAL_TRANSLATION_CONTRACT_RULES,
  ...UNIVERSAL_MIXED_LANGUAGE_RULES,
  ...UNIVERSAL_NON_TRANSLATABLE_RULES,
  ...UNIVERSAL_PUNCTUATION_PRINCIPLE,
  ...UNIVERSAL_TARGET_SCRIPT_RULES,
  ...UNIVERSAL_PARAGRAPH_CONTRACT_RULES,
  ...UNIVERSAL_RESPONSE_LENGTH_RULES,
];
