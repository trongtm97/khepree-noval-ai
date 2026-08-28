/** Character workbook sheet names (XLSX). */
export const CHARACTER_WORKBOOK_SHEETS = [
  'CHARACTERS',
  'CHARACTER_TRANSLATIONS',
  'RELATIONSHIPS',
  'RELATIONSHIP_RENDERING',
] as const;

export type CharacterWorkbookSheet = (typeof CHARACTER_WORKBOOK_SHEETS)[number];

/** Commit order for multi-sheet import. */
export const CHARACTER_WORKBOOK_COMMIT_ORDER: CharacterWorkbookSheet[] = [
  'CHARACTERS',
  'CHARACTER_TRANSLATIONS',
  'RELATIONSHIPS',
  'RELATIONSHIP_RENDERING',
];

export const CHARACTER_TABULAR_COLUMNS = [
  'character_id',
  'canonical_source_name',
  'role',
  'gender',
  'first_seen_chapter',
  'description',
  'source_aliases',
  'locked_facts',
] as const;

export const CHARACTER_TRANSLATION_TABULAR_COLUMNS = [
  'character_id',
  'edition_id',
  'target_language',
  'preferred_name',
  'target_aliases',
  'locked',
  'notes',
] as const;

export const RELATIONSHIP_TABULAR_COLUMNS = [
  'relationship_id',
  'character_a_id',
  'character_a_source',
  'character_b_id',
  'character_b_source',
  'relationship_type',
  'valid_from',
  'valid_to',
  'description',
] as const;

export const RELATIONSHIP_RENDERING_TABULAR_COLUMNS = [
  'edition_id',
  'relationship_id',
  'a_calls_b',
  'b_calls_a',
  'notes',
] as const;

export const CHARACTER_TABULAR_WARNINGS = {
  SOURCE_CHANGED: 'SOURCE_CHANGED',
  AMBIGUOUS_CHARACTER: 'AMBIGUOUS_CHARACTER',
  DISPLAY_NAME_COLLISION: 'DISPLAY_NAME_COLLISION',
  CHARACTER_NOT_FOUND: 'CHARACTER_NOT_FOUND',
  RELATIONSHIP_NOT_FOUND: 'RELATIONSHIP_NOT_FOUND',
  ID_NAME_MISMATCH: 'ID_NAME_MISMATCH',
} as const;

/** Legacy flat character import (v1) headers. */
export const CHARACTER_LEGACY_HEADERS = [
  'id',
  'canonical_name',
  'preferred_name',
  'gender',
  'role',
  'description',
  'aliases',
  'status',
  'locked',
  'notes',
] as const;
