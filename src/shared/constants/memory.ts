/** Character / memory entity statuses. */
export const CHARACTER_STATUSES = ['active', 'inactive', 'deceased', 'unknown'] as const;
export type CharacterStatus = (typeof CHARACTER_STATUSES)[number];

export const MEMORY_EVENT_CATEGORIES = [
  'plot',
  'world',
  'glossary',
  'character',
  'custom',
  'cultivation',
  'location',
  'item',
  'plot_point',
] as const;
export type MemoryEventCategory = (typeof MEMORY_EVENT_CATEGORIES)[number];

export const MEMORY_SOURCES = ['manual', 'ai_delta', 'import', 'bootstrap'] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const CONFLICT_STATUSES = ['PENDING', 'RESOLVED', 'DISCARDED'] as const;
export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export const RELATIONSHIP_TYPES = [
  'family',
  'master_disciple',
  'friend',
  'enemy',
  'lover',
  'rival',
  'colleague',
  'other',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Default recent memory window (chapters). */
export const DEFAULT_RECENT_CHAPTER_WINDOW = 5;

/** Default context character budget (estimated tokens). */
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 4000;
