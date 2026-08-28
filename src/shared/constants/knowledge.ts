/** Knowledge file types synced SQLite → local cache → Notebook (optional). */
export const KNOWLEDGE_TYPES = [
  'book_profile',
  'translation_rules',
  'project_terms',
  'characters',
  'relationships',
  'story_state',
  'world_knowledge',
  'recent_context',
  'sync_state',
] as const;

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export const KNOWLEDGE_FILE_NAMES: Record<KnowledgeType, string> = {
  book_profile: '00_BOOK_PROFILE.md',
  translation_rules: '01_TRANSLATION_RULES.md',
  project_terms: '02_PROJECT_TERMS.md',
  characters: '03_CHARACTERS.md',
  relationships: '04_RELATIONSHIPS.md',
  story_state: '05_STORY_STATE.md',
  world_knowledge: '06_WORLD_KNOWLEDGE.md',
  recent_context: '07_RECENT_CONTEXT.md',
  sync_state: '08_SYNC_STATE.md',
};

/** Per-file char budgets — semantic builder adds whole records until near cap. */
export const KNOWLEDGE_SIZE_CAPS = {
  book_profile: 6_000,
  translation_rules: 4_000,
  project_terms: 12_000,
  characters: 20_000,
  relationships: 8_000,
  story_state: 6_000,
  world_knowledge: 10_000,
  recent_context: 12_000,
  sync_state: 1_000,
} as const;

export const NOTEBOOK_FALLBACK_POLICIES = [
  'ALLOW_HOT_CONTEXT_FALLBACK',
  'STRICT_NOTEBOOK',
] as const;

export type NotebookFallbackPolicy = (typeof NOTEBOOK_FALLBACK_POLICIES)[number];

export const NOTEBOOK_CHAPTER_SOURCE_MODES = ['OFF', 'RECENT_ONLY', 'ARCHIVE_CHUNKS'] as const;
export type NotebookChapterSourceMode = (typeof NOTEBOOK_CHAPTER_SOURCE_MODES)[number];

export const DEFAULT_NOTEBOOK_SETTINGS = {
  fallbackPolicy: 'ALLOW_HOT_CONTEXT_FALLBACK' as NotebookFallbackPolicy,
  syncEveryNChapters: 10,
  recentContextChapters: 20,
  threadRotateEvery: 30,
  chapterSources: 'RECENT_ONLY' as NotebookChapterSourceMode,
  seedOnBootstrap: true,
  seedChapterCount: 10,
  bootstrapCharacterBudget: 80_000,
} as const;

export const KNOWLEDGE_SYNC_EVENT_TYPES = [
  'NOTEBOOK_PROVISION_STARTED',
  'NOTEBOOK_CREATED',
  'KNOWLEDGE_BUILD_STARTED',
  'KNOWLEDGE_FILE_CHANGED',
  'KNOWLEDGE_SYNC_STARTED',
  'KNOWLEDGE_SYNC_COMPLETED',
  'KNOWLEDGE_SYNCED',
  'KNOWLEDGE_SYNC_PENDING',
  'NOTEBOOK_SYNC_VERIFIED',
  'NOTEBOOK_SOURCE_PRESENT',
  'NOTEBOOK_VERSION_PROBE_STARTED',
  'NOTEBOOK_VERSION_MISMATCH',
  'NOTEBOOK_VERSION_VERIFIED',
  'NOTEBOOK_GROUNDING_VERIFIED',
  'NOTEBOOK_GROUNDING_UNVERIFIED',
  'NOTEBOOK_STALE',
  'NOTEBOOK_HEALTH_FAILED',
  'NOTEBOOK_HOT_FALLBACK',
  'NOTEBOOK_SEED_STARTED',
  'NOTEBOOK_SEED_COMPLETED',
  'NOTEBOOK_PREPARE_FOR_TRANSLATE',
  'PACK_MODE_SELECTED',
  'TRANSLATION_NOTEBOOK_OPENED',
  'PROMPT_SENT',
  'RESPONSE_CAPTURED',
  'LEARNING_APPLIED',
  'LOCAL_KNOWLEDGE_VERSION_BUMP',
  'WAVE_JOB_COMMITTED',
  'KNOWLEDGE_DIRTY',
  'LEARNING_EMPTY_DELTAS',
  'BOOTSTRAP_STARTED',
  'BOOTSTRAP_LOCAL_PREPARED',
  'BOOTSTRAP_AI_REQUESTED',
  'BOOTSTRAP_AI_RECEIVED',
  'BOOTSTRAP_PARSED',
  'BOOTSTRAP_PERSISTED',
  'BOOTSTRAP_KNOWLEDGE_BUILT',
  'BOOTSTRAP_COMPLETED',
  'BOOTSTRAP_FAILED',
  'BOOTSTRAP_SKIPPED',
] as const;

export type KnowledgeSyncEventType = (typeof KNOWLEDGE_SYNC_EVENT_TYPES)[number];

/** Owned markdown filenames under each project's knowledge cache. */
export const KNOWLEDGE_PROJECT_FILES = [
  '00_BOOK_PROFILE.md',
  '01_TRANSLATION_RULES.md',
  '02_PROJECT_TERMS.md',
  '03_CHARACTERS.md',
  '04_RELATIONSHIPS.md',
  '05_STORY_STATE.md',
  '06_WORLD_KNOWLEDGE.md',
  '07_RECENT_CONTEXT.md',
  '08_SYNC_STATE.md',
] as const;

export type KnowledgeProjectFileName = (typeof KNOWLEDGE_PROJECT_FILES)[number];

/** Resource keys for local knowledge files (legacy drive_resources keys — file names only). */
export const KNOWLEDGE_RESOURCE_KEYS = {
  BOOK_PROFILE_MD: '00_BOOK_PROFILE.md',
  RULES_MD: '01_TRANSLATION_RULES.md',
  PROJECT_TERMS_MD: '02_PROJECT_TERMS.md',
  CHARACTERS_MD: '03_CHARACTERS.md',
  RELATIONSHIPS_MD: '04_RELATIONSHIPS.md',
  STORY_STATE_MD: '05_STORY_STATE.md',
  WORLD_KNOWLEDGE_MD: '06_WORLD_KNOWLEDGE.md',
  RECENT_CONTEXT_MD: '07_RECENT_CONTEXT.md',
  SYNC_STATE_MD: '08_SYNC_STATE.md',
} as const;

export type KnowledgeResourceKey =
  (typeof KNOWLEDGE_RESOURCE_KEYS)[keyof typeof KNOWLEDGE_RESOURCE_KEYS];

export const KNOWLEDGE_SYNC_STATUSES = [
  'idle',
  'syncing',
  'synced',
  'pending',
  'error',
  'auth_required',
] as const;

export type KnowledgeSyncStatus = (typeof KNOWLEDGE_SYNC_STATUSES)[number];

/** Default memory sync interval (chapters). */
export const DEFAULT_KNOWLEDGE_SYNC_EVERY_N_CHAPTERS = 10;
