/** Soft limits under NotebookLM's 500k words / 200MB per source. */
export const NOTEBOOKLM_SOURCE_WORD_LIMIT = 500_000;
export const NOTEBOOKLM_SOURCE_BYTE_LIMIT = 200 * 1024 * 1024;

/** Safe packer ceilings (margin below platform limits). */
export const CORPUS_PART_MAX_WORDS = 450_000;
export const CORPUS_PART_MAX_BYTES = 180 * 1024 * 1024;

export const KNOWLEDGE_FILE_KEYS = [
  '00_BOOK_PROFILE.md',
  '01_TRANSLATION_RULES.md',
  '02_PROJECT_TERMS.md',
  '03_CHARACTERS.md',
  '04_RELATIONSHIPS.md',
  '05_STORY_STATE.md',
  '06_WORLD_KNOWLEDGE.md',
  '07_RECENT_CONTEXT.md',
] as const;

export type KnowledgeFileKey = (typeof KNOWLEDGE_FILE_KEYS)[number];
