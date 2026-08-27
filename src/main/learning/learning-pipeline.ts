import type { ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { DatabaseManager } from '../db/database-manager';
import { applyMemoryDelta, type MemoryDeltaApplyResult } from '../memory/memory-delta-processor';
import { applyTermDelta, type TermDeltaApplyResult } from './term-delta-processor';
import { compactProjectMemory, type CompactMemoryResult } from './memory-compactor';
import { NotebookKnowledgeBuilder } from '../notebook/knowledge-builder';
import type { ProjectKnowledgeDocuments } from '../notebook/knowledge-builder';
import { logger } from '../logging/logger';

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
  /** Test inject: override sync policy evaluation. */
  evaluateSyncPolicy?: (
    projectId: string,
    input: { chapterCount: number; critical?: boolean },
  ) => { shouldSync: boolean };
  /** Test inject: NotebookSyncService.syncDrive only — never call Drive API client here. */
  syncDrive?: (projectId: string) => Promise<unknown>;
  /**
   * Test inject: after Drive sync, schedule 08_SYNC_STATE version/nonce probe.
   * Production uses NotebookSyncService.scheduleBackgroundVersionProbe.
   */
  scheduleVersionProbe?: (projectId: string, accountId: string) => void;
}

export interface LearningPipelineResult {
  terms: TermDeltaApplyResult;
  memory: MemoryDeltaApplyResult;
  compact: CompactMemoryResult;
  consolidated: boolean;
  driveSyncTriggered: boolean;
  chapterCount: number;
  critical: boolean;
  documents?: ProjectKnowledgeDocuments;
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

/** Critical knowledge changes may force early Notebook Drive sync. */
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
 * Post-PASS learning lifecycle (single Notebook sync path):
 * SQLite → Dirty → NotebookSyncService → Drive → Notebook Pending → Verify → Ready.
 * Never call DriveSyncService directly from Learning.
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

  const terms = applyTermDelta(db, input.parsed.termDeltas, {
    projectId: input.projectId,
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
  );

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
      },
    });
  }

  const termActivity =
    terms.candidatesCreated > 0 ||
    terms.candidatesMerged > 0 ||
    terms.confirms > 0 ||
    terms.lockedTouched > 0;
  const memoryActivity = memory.applied > 0;
  const critical = isCriticalLearningChange(terms, memory);

  try {
    const { getNotebookSyncService } = await import(
      '../notebook/notebook-sync-service-singleton'
    );
    const sync = getNotebookSyncService(db);
    if (memory.charactersTouched > 0) {
      sync.markDirty(input.projectId, 'CHARACTER_CHANGED');
    }
    if (memory.relationshipsTouched > 0) {
      sync.markDirty(input.projectId, 'RELATIONSHIP_CHANGED');
    }
    if (memory.storyTouched > 0 || memoryActivity) {
      sync.markDirty(input.projectId, 'STORY_STATE_CHANGED');
    }
    if (memory.worldTouched > 0) {
      sync.markDirty(input.projectId, 'WORLD_KNOWLEDGE_CHANGED');
    }
    if (termActivity) {
      sync.markDirty(input.projectId, 'TERM_CHANGED');
    }
    if (memoryActivity || termActivity) {
      sync.markDirty(input.projectId, 'RECENT_CONTEXT_CHANGED');
    }
  } catch {
    // sync service optional in tests
  }

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

  // Every PASS: refresh local knowledge from SQLite (fat-pack / next chapter).
  try {
    const { getNotebookSyncService } = await import(
      '../notebook/notebook-sync-service-singleton'
    );
    getNotebookSyncService(db).rebuildKnowledge(input.projectId);
  } catch {
    // sync service optional in tests
  }

  let shouldSync = false;
  try {
    if (input.evaluateSyncPolicy) {
      shouldSync = input.evaluateSyncPolicy(input.projectId, {
        chapterCount,
        critical,
      }).shouldSync;
    } else {
      const { getNotebookSyncService } = await import(
        '../notebook/notebook-sync-service-singleton'
      );
      shouldSync = getNotebookSyncService(db).evaluateSyncPolicy(input.projectId, {
        chapterCount,
        critical,
      }).shouldSync;
    }
  } catch {
    // fall through — no sync when sync service unavailable
  }

  let consolidated = false;
  let driveSyncTriggered = false;
  let documents: ProjectKnowledgeDocuments | undefined;

  if (shouldSync || critical) {
    documents = new NotebookKnowledgeBuilder(db).buildAll(input.projectId);
    consolidated = true;
    db.learningEvents.create({
      project_id: input.projectId,
      event_type: 'consolidate',
      job_id: input.jobId,
      payload: {
        chars: {
          terms: documents['02_PROJECT_TERMS.md'].length,
          characters: documents['03_CHARACTERS.md'].length,
          relationships: documents['04_RELATIONSHIPS.md'].length,
          story: documents['05_STORY_STATE.md'].length,
          world: documents['06_WORLD_KNOWLEDGE.md'].length,
          recent: documents['07_RECENT_CONTEXT.md'].length,
        },
        shouldSync,
        critical,
        chapterCount,
      },
    });
  }

  if (shouldSync) {
    driveSyncTriggered = true;
    try {
      if (input.syncDrive) {
        await input.syncDrive(input.projectId);
      } else {
        const { getNotebookSyncService } = await import(
          '../notebook/notebook-sync-service-singleton'
        );
        await getNotebookSyncService(db).syncDrive(input.projectId);
      }
      db.learningEvents.create({
        project_id: input.projectId,
        event_type: 'drive_sync',
        job_id: input.jobId,
        payload: { ok: true, via: 'NotebookSyncService.syncDrive' },
      });

      // Pending → Verify (08_SYNC_STATE version+nonce) → Ready. Mapped notebook account only.
      const { resolveProjectWorker } = await import('../services/project-worker-resolver');
      const worker = resolveProjectWorker(db, {
        projectId: input.projectId,
        purpose: 'notebook',
      });
      if (worker.accountId) {
        if (input.scheduleVersionProbe) {
          input.scheduleVersionProbe(input.projectId, worker.accountId);
        } else {
          const { getNotebookSyncService } = await import(
            '../notebook/notebook-sync-service-singleton'
          );
          getNotebookSyncService(db).scheduleBackgroundVersionProbe(
            input.projectId,
            worker.accountId,
          );
        }
      }
    } catch (error) {
      // Drive failure: keep knowledge dirty; do not mark ready / sync_pending.
      logger.warn('Notebook Drive sync failed after learning', {
        projectId: input.projectId,
        message: error instanceof Error ? error.message : String(error),
      });
      db.learningEvents.create({
        project_id: input.projectId,
        event_type: 'drive_sync',
        job_id: input.jobId,
        payload: {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return {
    terms,
    memory,
    compact,
    consolidated,
    driveSyncTriggered,
    chapterCount,
    critical,
    documents,
  };
}

function pickSourceContext(map?: Record<string, string>): string | null {
  if (!map) return null;
  const first = Object.values(map)[0];
  return first ? first.slice(0, 500) : null;
}
