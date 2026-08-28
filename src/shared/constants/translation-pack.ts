import {
  FIDELITY_RULES,
  GENRE_RULES,
} from './translation-style-model';
import { OUTPUT_PROTOCOL_VERSION } from './output-protocol';

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

export { OUTPUT_PROTOCOL_VERSION } from './output-protocol';

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
export const OUTPUT_PROTOCOL_BLOCK = `Output Protocol Version: ${OUTPUT_PROTOCOL_VERSION}

Return EXACTLY these sections in order. No Markdown fences.

<TRANSLATION>
[C000001:P000001] TARGET_LANGUAGE_TRANSLATION...
</TRANSLATION>

<TERM_DELTA>
[]
</TERM_DELTA>

<MEMORY_DELTA>
[]
</MEMORY_DELTA>

TRANSLATION rules:
- Exactly one physical output line per source paragraph ID; ID must match Source exactly.
- Text in the target language only; one line per ID (no embedded line breaks in output).
- Do not repeat source text. No commentary, explanations, or markdown fences outside tags.

TERM_DELTA rules:
- JSON array of discover|update|confirm objects only when this batch supports new/changed/confirmed terminology.
- Use [] when the batch has no such terms — do not manufacture entries merely to fill the array.
- When a proper noun / technique / place name is newly translated with confidence, emit discover.
- Compact fields: action, source, target, category, optional transliteration + transliterationSystem, confidence, notes.
- Do not emit editionId, sourceLanguage, or targetLanguage — the application attaches pair provenance at persist.
- transliteration is generic (pinyin, romaji, romanization per source policy); omit when unnecessary. Legacy alias: reading.

MEMORY_DELTA rules:
- JSON array of upsert|delete|relationship|story_state only for facts newly supported or changed in this batch.
- Use [] when nothing new — do not manufacture entries merely to fill the array.
- Do not assert unknown or ambiguous facts with high confidence.
- Prefer source-story facts in upsert values; do not store target-language prose as universal story facts.
- When a named character appears for the first time with clear evidence, upsert category "character" with object value linking canonical source identity; target rendering belongs in edition layer.
- relationship: language-neutral type/description/validFrom/validTo; aCallsB/bCallsA are edition-scoped forms of address.

General:
- Locked/active terms MUST be used exactly as given.
- Do not skip paragraph IDs. Do not invent IDs.`;
