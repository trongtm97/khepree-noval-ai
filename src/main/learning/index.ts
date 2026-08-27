export { applyTermDelta } from './term-delta-processor';
export type { TermDeltaApplyResult, TermDeltaContext } from './term-delta-processor';
export { runLearningPipeline, countCompletedChapters, isCriticalLearningChange } from './learning-pipeline';
export type { LearningPipelineInput, LearningPipelineResult } from './learning-pipeline';
export { compactProjectMemory } from './memory-compactor';
export { computeAdjustedConfidence, mapDeltaConfidence } from './confidence';
