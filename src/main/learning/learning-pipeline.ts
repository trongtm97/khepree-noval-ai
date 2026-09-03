import type { ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { DatabaseManager } from '../db/database-manager';
import { withTransaction } from '../db/transaction';
import { applyMemoryDelta, type MemoryDeltaApplyResult } from '../memory/memory-delta-processor';
import { resolveEditionFromJob } from '../memory/edition-memory';
import { resolveForProjectEdition } from '../services/translation-language-resolver';
import { applyTermDelta, type TermDeltaApplyResult } from './term-delta-processor';
import { compactProjectMemory, type CompactMemoryResult } from './memory-compactor';
import { NotebookKnowledgeBuilder } from '../notebook/knowledge-builder';
import {
  bumpLocalKnowledgeAfterLearning,
  getProjectKnowledgeVersion,
} from '../knowledge/knowledge-version';

export interface LearningPipelineInput {
  projectId: string;
  jobId: string;
  parsed: ParsedBatchResult;
  chapterFrom?: number | null;
  chapterTo?: number | null;
  /**
   * Explicit count of chapters successfully translated in this PASS.
   * Prefer over chapterFrom/To when available.
   */
  chaptersCompleted?: number | null;
  sourceContextByParagraph?: Record<string, string>;
}

export interface LearningPipelineResult {
  terms: TermDeltaApplyResult;
  memory: MemoryDeltaApplyResult;
  compact: CompactMemoryResult;
  chapterCount: number;
  critical: boolean;
  /** Monotonic local knowledge version after this PASS commit. */
  knowledgeVersionAtCommit: number;
}

/**
 * Count chapters covered by a successful translate batch.
 * Job 101–103 → 3 (not 1).
 */
export function countCompletedChapters(input: {
  chapterFrom?: number | null;
  chapterTo?: number | null;
  chaptersCompleted?: number | null;
}): number {
  if (
    input.chaptersCompleted != null &&
    Number.isFinite(input.chaptersCompleted) &&
    input.chaptersCompleted > 0
  ) {
    return Math.floor(input.chaptersCompleted);
  }
  const from = input.chapterFrom;
  const to = input.chapterTo;
  if (from != null && to != null && Number.isFinite(from) && Number.isFinite(to)) {
    return Math.max(0, Math.floor(to) - Math.floor(from) + 1);
  }
  if (from != null || to != null) return 1;
  return 0;
}

/** Critical knowledge changes — used for diagnostics and compaction hints. */
export function isCriticalLearningChange(
  terms: TermDeltaApplyResult,
  memory: MemoryDeltaApplyResult,
): boolean {
  return (
    terms.lockedTouched > 0 ||
    memory.conflicts.length > 0 ||
    memory.charactersTouched > 0 ||
    memory.relationshipsTouched > 0 ||
    memory.storyTouched > 0 ||
    memory.worldTouched > 0
  );
}

/**
 * Post-PASS learning lifecycle (local-first).
 * SQLite txn → version bump → local knowledge rebuild → next job sees new version.
 */
export async function runLearningPipeline(
  db: DatabaseManager,
  input: LearningPipelineInput,
): Promise<LearningPipelineResult> {
  const chapterNumber = input.chapterTo ?? input.chapterFrom ?? null;
  const chapter =
    chapterNumber != null
      ? db.chapters.getByProjectAndNumber(input.projectId, chapterNumber)
      : null;

  const sourceContext =
    pickSourceContext(input.sourceContextByParagraph) ??
    chapter?.source_text?.slice(0, 500) ??
    null;

  const edition = resolveEditionFromJob(db, input.projectId, input.jobId);
  const pair = resolveForProjectEdition(db, {
    projectId: input.projectId,
    editionId: edition.editionId,
  });

  const applied = withTransaction(db.getConnection(), () => {
    const terms = applyTermDelta(db, input.parsed.termDeltas, {
      projectId: input.projectId,
      editionId: pair.editionId,
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
      chapterId: chapter?.id ?? null,
      chapterNumber,
      sourceContext,
      jobId: input.jobId,
    });

    const memory = applyMemoryDelta(
      db,
      input.projectId,
      input.parsed.memoryDeltas,
      chapterNumber ?? undefined,
      edition.editionId,
    );

    const knowledgeVersionAtCommit = bumpLocalKnowledgeAfterLearning(db, input.projectId, {
      terms,
      memory,
    });

    return { terms, memory, knowledgeVersionAtCommit };
  });

  const { terms, memory } = applied;
  let { knowledgeVersionAtCommit } = applied;

  if (memory.applied > 0) {
    db.learningEvents.create({
      project_id: input.projectId,
      event_type: 'memory_applied',
      job_id: input.jobId,
      payload: {
        applied: memory.applied,
        skipped: memory.skipped,
        charactersTouched: memory.charactersTouched,
        relationshipsTouched: memory.relationshipsTouched,
        storyTouched: memory.storyTouched,
        worldTouched: memory.worldTouched,
        knowledgeVersionAtCommit,
      },
    });
  }

  const critical = isCriticalLearningChange(terms, memory);

  for (const conflict of memory.conflicts) {
    db.learningEvents.create({
      project_id: input.projectId,
      event_type: 'memory_conflict',
      job_id: input.jobId,
      payload: {
        conflictId: conflict.id,
        fieldKey: conflict.field_key,
        entityType: conflict.entity_type,
      },
    });
  }

  const compact = compactProjectMemory(db, input.projectId, {
    currentChapter: chapterNumber,
  });

  const chapterCount = countCompletedChapters(input);

  try {
    const { getNotebookSyncService } = await import(
      '../notebook/notebook-sync-service-singleton'
    );
    getNotebookSyncService(db).rebuildKnowledge(input.projectId);
  } catch {
    try {
      new NotebookKnowledgeBuilder(db).rebuildAndTrack(input.projectId);
    } catch {
      // optional in tests
    }
  }

  knowledgeVersionAtCommit = getProjectKnowledgeVersion(db, input.projectId);

  return {
    terms,
    memory,
    compact,
    chapterCount,
    critical,
    knowledgeVersionAtCommit,
  };
}

function pickSourceContext(map?: Record<string, string>): string | null {
  if (!map) return null;
  const first = Object.values(map)[0];
  return first ? first.slice(0, 500) : null;
}
