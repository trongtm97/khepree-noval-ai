import {
  FIDELITY_RULES,
  GENRE_RULES,
} from './translation-style-model';

/** Configurable translation style presets (legacy UI/API values). */
export const TRANSLATION_STYLES = [
  'literal',
  'balanced',
  'natural',
  'xianxia',
  'urban',
  'romance',
] as const;

export type TranslationStyle = (typeof TRANSLATION_STYLES)[number];

/**
 * Pack operation — provider adaptation may swap CONTEXT only.
 * Never rewrite operationPrompt for REPAIR / CONTINUATION.
 */
export const TRANSLATION_PACK_OPERATIONS = [
  'TRANSLATE',
  'REPAIR',
  'CONTINUATION',
] as const;

export type TranslationPackOperation = (typeof TRANSLATION_PACK_OPERATIONS)[number];

/** Batch size: 1–5 chapters. */
export const MIN_PACK_CHAPTERS = 1;
export const MAX_PACK_CHAPTERS = 5;

/** Soft ceilings for prompt-bloat snapshot guards (characters). */
export const PACK_SIZE_LIMITS = {
  /** Context-only section (rules + memory + terms + protocol), excluding source. */
  maxContextChars: 8_000,
  /** Full rendered prompt excluding source paragraphs. */
  maxOverheadChars: 10_000,
  /** Absolute hard cap on full prompt size (source included). */
  maxTotalChars: 120_000,
} as const;

/**
 * @deprecated Prefer composeTranslationStyleRules with source/target languages.
 * Generic fidelity + genre only — no language-pair overrides.
 */
export const TRANSLATION_STYLE_RULES: Record<TranslationStyle, string[]> = {
  literal: [...FIDELITY_RULES.LITERAL],
  balanced: [...FIDELITY_RULES.BALANCED],
  natural: [...FIDELITY_RULES.NATURAL],
  xianxia: [...FIDELITY_RULES.BALANCED, ...GENRE_RULES.XIANXIA],
  urban: [...FIDELITY_RULES.BALANCED, ...GENRE_RULES.URBAN],
  romance: [...FIDELITY_RULES.BALANCED, ...GENRE_RULES.ROMANCE],
};

/** Language-agnostic output protocol — no locale-specific examples. */
export const OUTPUT_PROTOCOL_BLOCK = `Return EXACTLY these sections in order. No markdown fences inside tags.

<TRANSLATION>
[C000001:P000001] TARGET_LANGUAGE_TRANSLATION...
</TRANSLATION>

<TERM_DELTA>
[]
</TERM_DELTA>

<MEMORY_DELTA>
[]
</MEMORY_DELTA>

Rules:
- TRANSLATION: one line per source paragraph; ID must match source exactly; text in the target language only.
- TERM_DELTA: JSON array of discover|update|confirm objects. Use [] only when the batch truly has no new names/terms.
- MEMORY_DELTA: JSON array of upsert|delete|relationship|story_state objects. Use [] only when nothing new about cast/world/plot.
- Opening chapters should extract main cast and key terms when they appear.
- When a named character appears for the first time, emit MEMORY_DELTA upsert with category "character" and object value { "translatedName": "..." } (not a bare string) and/or a relationship entry — empty MEMORY_DELTA while new cast appears is incorrect.
- When a proper noun / technique / place name is newly translated, emit TERM_DELTA discover — empty TERM_DELTA while such names appear is incorrect.
- Do not skip paragraph IDs. Do not invent IDs.
- Locked/active terms MUST be used exactly as given.`;
