/** Knowledge file types synced SQLite → Drive → Notebook. */
export const KNOWLEDGE_TYPES = [
  'book_profile',
  'translation_rules',
  'project_terms',
  'characters',
  'relationships',
  'story_state',
  'world_knowledge',
  'recent_context',
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
  'DRIVE_SYNC_STARTED',
  'DRIVE_SYNC_COMPLETED',
  'NOTEBOOK_SYNC_PENDING',
  'NOTEBOOK_SYNC_VERIFIED',
  'NOTEBOOK_STALE',
  'NOTEBOOK_HEALTH_FAILED',
  'NOTEBOOK_HOT_FALLBACK',
  'NOTEBOOK_SEED_STARTED',
  'NOTEBOOK_SEED_COMPLETED',
  'NOTEBOOK_PREPARE_FOR_TRANSLATE',
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
