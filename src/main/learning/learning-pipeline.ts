import type { ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { DatabaseManager } from '../db/database-manager';
import { applyMemoryDelta, type MemoryDeltaApplyResult } from '../memory/memory-delta-processor';
import { applyTermDelta, type TermDeltaApplyResult } from './term-delta-processor';
import { compactProjectMemory, type CompactMemoryResult } from './memory-compactor';
import { buildProjectDriveDocuments } from '../drive/drive-content-builder';
import { logger } from '../logging/logger';

export interface LearningPipelineInput {
  projectId: string;
  jobId: string;
  parsed: ParsedBatchResult;
  chapterFrom?: number | null;
  chapterTo?: number | null;
  sourceContextByParagraph?: Record<string, string>;
  /** Injected for tests / optional Drive wiring. */
  onChapterCompleted?: (projectId: string) => { shouldSync: boolean };
  syncProject?: (projectId: string) => Promise<unknown>;
}

export interface LearningPipelineResult {
  terms: TermDeltaApplyResult;
  memory: MemoryDeltaApplyResult;
  compact: CompactMemoryResult;
  consolidated: boolean;
  driveSyncTriggered: boolean;
  documents?: ReturnType<typeof buildProjectDriveDocuments>;
}

/**
 * Post-PASS learning: TERM_DELTA → candidates, MEMORY_DELTA → apply/conflict,
 * compact archives, every N chapters consolidate markdown + Drive sync.
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
      },
    });
  }

  const termActivity =
    terms.candidatesCreated > 0 || terms.candidatesMerged > 0 || terms.confirms > 0;
  const memoryActivity = memory.applied > 0;

  try {
    const { getNotebookSyncService } = await import(
      '../notebook/notebook-sync-service-singleton'
    );
    const sync = getNotebookSyncService(db);
    if (memory.charactersTouched > 0) {
      sync.markDirty(
        input.projectId,
        'CHARACTER_CHANGED',
        `Character delta after job ${input.jobId} (ch.${chapterNumber ?? '?'})`,
      );
    }
    if (memory.relationshipsTouched > 0) {
      sync.markDirty(
        input.projectId,
        'RELATIONSHIP_CHANGED',
        `Relationship delta after job ${input.jobId} (ch.${chapterNumber ?? '?'})`,
      );
    }
    if (memory.storyTouched > 0 || memoryActivity) {
      sync.markDirty(
        input.projectId,
        'STORY_STATE_CHANGED',
        `Memory delta applied after job ${input.jobId} (ch.${chapterNumber ?? '?'})`,
      );
    }
    if (termActivity) {
      sync.markDirty(
        input.projectId,
        'TERM_CHANGED',
        `Term delta: ${terms.candidatesCreated} created, ${terms.confirms} confirms`,
      );
    }
    if (memoryActivity || termActivity) {
      sync.markDirty(
        input.projectId,
        'RECENT_CONTEXT_CHANGED',
        `Recent context after job ${input.jobId} (ch.${chapterNumber ?? '?'})`,
      );
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

  let consolidated = false;
  let driveSyncTriggered = false;
  let documents: ReturnType<typeof buildProjectDriveDocuments> | undefined;

  const { shouldSync } = advanceChapterCounter(db, input.projectId, input.onChapterCompleted);

  const forceConsolidate =
    shouldSync || memory.conflicts.length > 0 || terms.confirms > 0;

  if (forceConsolidate) {
    if (!shouldSync && (memory.conflicts.length > 0 || terms.confirms > 0)) {
      db.driveSyncState.patch(input.projectId, {
        criticalChangePending: true,
        syncStatus: 'pending',
      });
    }

    documents = buildProjectDriveDocuments(db, input.projectId);
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
          world: documents['06_WORLD_KNOWLEDGE.md']?.length ?? 0,
          recent: documents['07_RECENT_CONTEXT.md']?.length ?? 0,
        },
        shouldSync,
      },
    });
  }

  // Every PASS: refresh local knowledge files from SQLite so the next chapter's
  // fat-pack sees updated story/terms (Drive → NotebookLM still follows sync_every_n).
  try {
    const { getNotebookSyncService } = await import(
      '../notebook/notebook-sync-service-singleton'
    );
    getNotebookSyncService(db).rebuildKnowledge(input.projectId);
  } catch {
    // sync service optional in tests
  }

  if (shouldSync) {
    driveSyncTriggered = true;
    try {
      if (input.syncProject) {
        await input.syncProject(input.projectId);
      } else {
        const { getDriveSyncService } = await import(
          '../services/drive-sync-service-singleton'
        );
        await getDriveSyncService().syncProject(input.projectId);
      }
      db.learningEvents.create({
        project_id: input.projectId,
        event_type: 'drive_sync',
        job_id: input.jobId,
        payload: { ok: true },
      });
    } catch (error) {
      logger.warn('Drive sync failed after consolidate', {
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
    documents,
  };
}

function advanceChapterCounter(
  db: DatabaseManager,
  projectId: string,
  injected?: (projectId: string) => { shouldSync: boolean },
): { shouldSync: boolean } {
  if (injected) return injected(projectId);

  const state = db.driveSyncState.ensure(projectId);
  const next = state.chapters_since_sync + 1;
  const shouldSync =
    state.critical_change_pending === 1 || next >= state.sync_every_n_chapters;
  db.driveSyncState.patch(projectId, {
    chaptersSinceSync: shouldSync ? 0 : next,
    criticalChangePending: shouldSync ? false : state.critical_change_pending === 1,
    syncStatus: shouldSync ? 'pending' : undefined,
  });
  return { shouldSync };
}

function pickSourceContext(map?: Record<string, string>): string | null {
  if (!map) return null;
  const first = Object.values(map)[0];
  return first ? first.slice(0, 500) : null;
}
