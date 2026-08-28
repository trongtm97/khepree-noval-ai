import type { DatabaseManager } from '../db/database-manager';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';
import {
  PARALLEL_WAVES_DEFAULT_ENABLED,
  PARALLEL_WAVES_FEATURE_KEY,
} from '@shared/constants/parallel-waves';
import { utcNow } from '../db/utils/timestamps';
import { logger } from '../logging/logger';
import { runLearningPipeline } from '../learning/learning-pipeline';
import { persistParsedTranslations } from '../learning/translation-persistence';
import {
  assignWaveOrderIndices,
  stripConflictingDeltas,
  validateWaveConsistency,
  type WaveConflict,
} from './wave-consistency-validator';

export interface WaveProvisionalPayload {
  parsed: ParsedBatchResult;
  versionSource: 'AI_INITIAL' | 'AI_REPAIR';
  chapterFrom: number | null;
  chapterTo: number | null;
  chaptersCompleted: number;
  sourceContextByParagraph: Record<string, string>;
}

export function isParallelWavesEnabled(db: DatabaseManager): boolean {
  const raw = db.appMeta.get(PARALLEL_WAVES_FEATURE_KEY);
  if (raw == null) return PARALLEL_WAVES_DEFAULT_ENABLED;
  return raw === '1' || raw === 'true';
}

export function setParallelWavesEnabled(db: DatabaseManager, enabled: boolean): void {
  db.appMeta.set(PARALLEL_WAVES_FEATURE_KEY, enabled ? '1' : '0');
}

/**
 * Freeze knowledge snapshot and attach jobs in deterministic chapter order.
 * Commit barrier always applies — FULL notebook does not skip this.
 */
export function createTranslationWave(db: DatabaseManager, input: {
  projectId: string;
  editionId?: string | null;
  jobs: { jobId: string; chapterFrom: number; chapterTo: number }[];
}): { waveId: string; knowledgeVersion: number; jobCount: number } {
  if (input.jobs.length === 0) {
    throw new Error('createTranslationWave requires at least one job');
  }

  const knowledgeVersion = db.knowledgeFiles.maxLocalVersion(input.projectId);
  const chapterFrom = Math.min(...input.jobs.map((j) => j.chapterFrom));
  const chapterTo = Math.max(...input.jobs.map((j) => j.chapterTo));

  const wave = db.translationWaves.createWave({
    projectId: input.projectId,
    editionId: input.editionId ?? null,
    knowledgeVersion,
    chapterFrom,
    chapterTo,
    status: 'RUNNING',
  });

  const ordered = assignWaveOrderIndices(
    input.jobs.map((j) => ({ jobId: j.jobId, chapterFrom: j.chapterFrom })),
  );

  for (const row of ordered) {
    db.translationWaves.attachJob({
      waveId: wave.id,
      jobId: row.jobId,
      orderIndex: row.orderIndex,
      snapshotVersion: knowledgeVersion,
    });
  }

  logger.info('Parallel Translation Wave created', {
    waveId: wave.id,
    projectId: input.projectId,
    knowledgeVersion,
    jobCount: ordered.length,
    chapterFrom,
    chapterTo,
  });

  return {
    waveId: wave.id,
    knowledgeVersion,
    jobCount: ordered.length,
  };
}

export async function storeWaveProvisional(
  db: DatabaseManager,
  jobId: string,
  payload: WaveProvisionalPayload,
): Promise<boolean> {
  const waveJob = db.translationWaves.getWaveJobByJobId(jobId);
  if (!waveJob) return false;

  db.translationWaves.updateWaveJob(waveJob.id, {
    resultStatus: 'SUCCEEDED',
    commitStatus: 'PROVISIONAL',
    provisionalPayload: JSON.stringify(payload),
    conflictSummary: null,
  });

  logger.info('Wave job stored provisional (commit barrier pending)', {
    waveId: waveJob.wave_id,
    jobId,
    orderIndex: waveJob.order_index,
  });

  await tryAdvanceWaveCommit(db, waveJob.wave_id);
  return true;
}

export function markWaveJobFailed(db: DatabaseManager, jobId: string): void {
  const waveJob = db.translationWaves.getWaveJobByJobId(jobId);
  if (!waveJob) return;
  db.translationWaves.updateWaveJob(waveJob.id, {
    resultStatus: 'FAILED',
    commitStatus: 'SKIPPED',
  });
  void tryAdvanceWaveCommit(db, waveJob.wave_id);
}

function parseProvisional(raw: string | null): WaveProvisionalPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WaveProvisionalPayload;
  } catch {
    return null;
  }
}

function collectLockedTargets(db: DatabaseManager, projectId: string): Record<string, string> {
  const out: Record<string, string> = {};
  const terms = db.terms.listAllForProject(projectId);
  for (const t of terms) {
    if (t.locked !== 1) continue;
    const sourceRaw =
      t.source_text != null && t.source_text.length > 0
        ? t.source_text
        : t.source_simplified;
    const source = sourceRaw.toLowerCase();
    const target = db.terms.getPrimaryTranslation(t.id);
    if (source && target) out[source] = target;
  }
  return out;
}

async function commitWaveJob(
  db: DatabaseManager,
  projectId: string,
  jobId: string,
  waveJobId: string,
  payload: WaveProvisionalPayload,
  parsed: ParsedBatchResult,
  commitStatus: 'COMMITTED' | 'CONFLICT_REPAIR',
  conflicts: WaveConflict[],
): Promise<void> {
  const translationPersist = persistParsedTranslations(db, {
    projectId,
    parsed,
    versionSource: payload.versionSource,
  });

  const learning = await runLearningPipeline(db, {
    projectId,
    jobId,
    parsed,
    chapterFrom: payload.chapterFrom,
    chapterTo: payload.chapterTo,
    chaptersCompleted: payload.chaptersCompleted,
    sourceContextByParagraph: payload.sourceContextByParagraph,
  });

  db.jobs.setKnowledgeVersionAtCommit(jobId, learning.knowledgeVersionAtCommit);

  db.translationWaves.updateWaveJob(waveJobId, {
    commitStatus,
    provisionalPayload: null,
    conflictSummary:
      conflicts.length > 0
        ? JSON.stringify({
            conflicts,
            translationPersist,
            learning: {
              candidatesCreated: learning.terms.candidatesCreated,
              memoryApplied: learning.memory.applied,
            },
          })
        : null,
  });

  db.knowledgeSyncEvents.insert({
    projectId,
    eventType: 'WAVE_JOB_COMMITTED',
    message:
      commitStatus === 'CONFLICT_REPAIR'
        ? `Wave commit with soft conflict repair for job ${jobId}`
        : `Wave commit barrier applied for job ${jobId}`,
    metadata: { jobId, waveJobId, commitStatus, conflictCount: conflicts.length },
  });
}

function requeueForWaveRetranslate(db: DatabaseManager, jobId: string, waveJobId: string): void {
  db.jobs.requeueForRetranslate(
    jobId,
    'Wave commit barrier — retranslate with latest context',
  );

  db.translationWaves.updateWaveJob(waveJobId, {
    resultStatus: 'PENDING',
    commitStatus: 'RETRANSLATE',
    provisionalPayload: null,
    conflictSummary: JSON.stringify({
      action: 'retranslate',
      reason: 'hard consistency conflict with earlier wave job',
    }),
  });
}

/**
 * Advance commit frontier in order_index ASC.
 * Never skip ConsistencyValidator — even with FULL Research Knowledge.
 */
export async function tryAdvanceWaveCommit(
  db: DatabaseManager,
  waveId: string,
): Promise<{ committed: number; blocked: boolean; retranslate: number }> {
  const wave = db.translationWaves.getWaveById(waveId);
  if (!wave) return { committed: 0, blocked: true, retranslate: 0 };
  if (wave.status === 'COMPLETED' || wave.status === 'CANCELLED') {
    return { committed: 0, blocked: false, retranslate: 0 };
  }

  db.translationWaves.updateWaveStatus(waveId, 'COMMITTING');

  const jobs = db.translationWaves.listWaveJobsOrdered(waveId);
  const committedPayloads: ParsedBatchResult[] = [];
  let committed = 0;
  let retranslate = 0;
  let blocked = false;
  const locked = collectLockedTargets(db, wave.project_id);

  for (const wj of jobs) {
    if (wj.commit_status === 'COMMITTED' || wj.commit_status === 'CONFLICT_REPAIR') {
      const prev = parseProvisional(wj.provisional_payload);
      // After commit provisional is cleared — rebuild from conflict_summary if needed.
      if (prev?.parsed) committedPayloads.push(prev.parsed);
      else if (wj.conflict_summary) {
        try {
          const summary = JSON.parse(wj.conflict_summary) as {
            committedParsed?: ParsedBatchResult;
          };
          if (summary.committedParsed) committedPayloads.push(summary.committedParsed);
        } catch {
          // ignore
        }
      }
      continue;
    }

    if (wj.commit_status === 'SKIPPED' || wj.result_status === 'FAILED') {
      continue;
    }

    if (wj.commit_status === 'RETRANSLATE' && wj.result_status === 'PENDING') {
      blocked = true;
      break;
    }

    if (wj.commit_status !== 'PROVISIONAL' || wj.result_status !== 'SUCCEEDED') {
      blocked = true;
      break;
    }

    const payload = parseProvisional(wj.provisional_payload);
    if (!payload?.parsed) {
      blocked = true;
      break;
    }

    const check = validateWaveConsistency({
      committed: committedPayloads,
      candidate: payload.parsed,
      lockedTermTargets: locked,
    });

    if (check.action === 'retranslate') {
      requeueForWaveRetranslate(db, wj.job_id, wj.id);
      retranslate += 1;
      blocked = true;
      logger.warn('Wave hard conflict — retranslate', {
        waveId,
        jobId: wj.job_id,
        conflicts: check.conflicts,
      });
      break;
    }

    let toCommit = payload.parsed;
    let status: 'COMMITTED' | 'CONFLICT_REPAIR' = 'COMMITTED';
    if (check.action === 'repair') {
      toCommit = stripConflictingDeltas(payload.parsed, check.conflicts);
      status = 'CONFLICT_REPAIR';
      logger.info('Wave soft conflict — strip conflicting deltas and commit', {
        waveId,
        jobId: wj.job_id,
        conflictCount: check.conflicts.length,
      });
    }

    try {
      await commitWaveJob(
        db,
        wave.project_id,
        wj.job_id,
        wj.id,
        payload,
        toCommit,
        status,
        check.conflicts,
      );

      db.translationWaves.updateWaveJob(wj.id, {
        conflictSummary: JSON.stringify({
          conflicts: check.conflicts,
          committedParsed: toCommit,
        }),
      });

      committedPayloads.push(toCommit);
      committed += 1;
    } catch (error) {
      logger.warn('Wave commit failed', {
        waveId,
        jobId: wj.job_id,
        message: error instanceof Error ? error.message : String(error),
      });
      db.translationWaves.updateWaveJob(wj.id, {
        commitStatus: 'PROVISIONAL',
        conflictSummary: JSON.stringify({
          commitError: error instanceof Error ? error.message : String(error),
        }),
      });
      blocked = true;
      break;
    }
  }

  const refreshed = db.translationWaves.listWaveJobsOrdered(waveId);
  const allDone = refreshed.every(
    (j) =>
      j.commit_status === 'COMMITTED' ||
      j.commit_status === 'CONFLICT_REPAIR' ||
      j.commit_status === 'SKIPPED',
  );

  if (allDone) {
    const kv = db.knowledgeFiles.maxLocalVersion(wave.project_id);
    db.translationWaves.updateWaveStatus(waveId, 'COMPLETED', {
      completedAt: utcNow(),
      knowledgeVersion: kv,
    });
  } else if (!blocked) {
    db.translationWaves.updateWaveStatus(waveId, 'RUNNING');
  }

  return { committed, blocked, retranslate };
}

/** Whether this job is under a wave commit barrier (skip immediate learning). */
export function isWaveBarrierJob(db: DatabaseManager, jobId: string): boolean {
  return db.translationWaves.getWaveJobByJobId(jobId) != null;
}

export { assignWaveOrderIndices, validateWaveConsistency, stripConflictingDeltas };
