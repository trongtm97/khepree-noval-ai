/**
 * Full-novel preprocess run stages (SQLite-persisted, resumable).
 * QUICK bootstrap does not use these stages.
 */
export const FULL_NOVEL_PREPROCESS_STAGES = [
  'PACKING',
  'NOTEBOOK_READY',
  'SOURCES_UPLOADING',
  'SOURCES_UPLOADED',
  'SOURCES_INDEXING',
  'SOURCES_READY',
  'ANALYSIS_SENT',
  'ANALYSIS_RUNNING',
  'RESPONSE_CAPTURED',
  'RESPONSE_PARSED',
  'KNOWLEDGE_IMPORTED',
  'COMPLETED',
  'FAILED',
] as const;

export type FullNovelPreprocessStage = (typeof FULL_NOVEL_PREPROCESS_STAGES)[number];

export const PREPROCESS_PART_SOURCE_STATUSES = [
  'PENDING',
  'UPLOADED',
  'PROCESSING',
  'READY',
  'ERROR',
  'SKIPPED',
] as const;

export type PreprocessPartSourceStatus = (typeof PREPROCESS_PART_SOURCE_STATUSES)[number];

/** Default wait for NotebookLM to index all FULL corpus sources (20 minutes). */
export const FULL_PREPROCESS_SOURCE_INDEX_TIMEOUT_MS = 20 * 60 * 1000;

/** Poll interval while waiting for source READY (UI stays responsive via progress). */
export const FULL_PREPROCESS_SOURCE_POLL_MS = 2_500;

export function stageRank(stage: FullNovelPreprocessStage): number {
  const i = FULL_NOVEL_PREPROCESS_STAGES.indexOf(stage);
  return i >= 0 ? i : -1;
}

export function isStageAtLeast(
  current: FullNovelPreprocessStage,
  target: FullNovelPreprocessStage,
): boolean {
  return stageRank(current) >= stageRank(target);
}
