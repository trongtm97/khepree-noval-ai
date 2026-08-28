import type { DatabaseManager } from '../db/database-manager';
import {
  KNOWLEDGE_TYPES,
  type KnowledgeType,
} from '@shared/constants/knowledge';
import type { MemoryDeltaApplyResult } from '../memory/memory-delta-processor';
import type { TermDeltaApplyResult } from '../learning/term-delta-processor';

/** Monotonic local project knowledge version (max knowledge_files.local_version). */
export function getProjectKnowledgeVersion(
  db: DatabaseManager,
  projectId: string,
): number {
  return db.knowledgeFiles.maxLocalVersion(projectId);
}

const TERM_TYPES: KnowledgeType[] = ['project_terms'];
const CHARACTER_TYPES: KnowledgeType[] = ['characters'];
const RELATIONSHIP_TYPES: KnowledgeType[] = ['relationships'];
const STORY_TYPES: KnowledgeType[] = ['story_state', 'recent_context'];
const WORLD_TYPES: KnowledgeType[] = ['world_knowledge'];
const RECENT_TYPES: KnowledgeType[] = ['recent_context'];

function markTypesDirty(
  db: DatabaseManager,
  projectId: string,
  types: readonly KnowledgeType[],
): void {
  for (const type of types) {
    db.knowledgeFiles.markDirty(projectId, type);
  }
}

/**
 * Bump local knowledge version for learning deltas — no Notebook/Drive side effects.
 * Returns post-bump project knowledge version.
 */
export function bumpLocalKnowledgeAfterLearning(
  db: DatabaseManager,
  projectId: string,
  input: {
    terms: TermDeltaApplyResult;
    memory: MemoryDeltaApplyResult;
  },
): number {
  const termActivity =
    input.terms.candidatesCreated > 0 ||
    input.terms.candidatesMerged > 0 ||
    input.terms.confirms > 0 ||
    input.terms.updates > 0 ||
    input.terms.lockedTouched > 0;
  const memoryActivity = input.memory.applied > 0;

  if (!termActivity && !memoryActivity) {
    return getProjectKnowledgeVersion(db, projectId);
  }

  if (termActivity) markTypesDirty(db, projectId, TERM_TYPES);
  if (input.memory.charactersTouched > 0) {
    markTypesDirty(db, projectId, CHARACTER_TYPES);
  }
  if (input.memory.relationshipsTouched > 0) {
    markTypesDirty(db, projectId, RELATIONSHIP_TYPES);
  }
  if (input.memory.storyTouched > 0 || memoryActivity) {
    markTypesDirty(db, projectId, STORY_TYPES);
  }
  if (input.memory.worldTouched > 0) {
    markTypesDirty(db, projectId, WORLD_TYPES);
  }
  if (termActivity || memoryActivity) {
    markTypesDirty(db, projectId, RECENT_TYPES);
  }

  const version = getProjectKnowledgeVersion(db, projectId);
  db.knowledgeSyncState.patch(projectId, {
    pendingKnowledgeVersion: version,
  });
  db.knowledgeSyncEvents.insert({
    projectId,
    eventType: 'LOCAL_KNOWLEDGE_VERSION_BUMP',
    message: `Local knowledge version → ${version}`,
    metadata: { version },
  });
  return version;
}

/** Resolve pack/job snapshot: wave freeze wins over live DB. */
export function resolveJobKnowledgeSnapshot(
  db: DatabaseManager,
  jobId: string,
  projectId: string,
): number {
  const waveJob = db.translationWaves.getWaveJobByJobId(jobId);
  if (waveJob) return waveJob.snapshot_version;

  const job = db.jobs.getById(jobId);
  if (job?.knowledge_version_at_start != null) {
    return job.knowledge_version_at_start;
  }

  return getProjectKnowledgeVersion(db, projectId);
}

export function listAllKnowledgeTypes(): readonly KnowledgeType[] {
  return KNOWLEDGE_TYPES;
}
