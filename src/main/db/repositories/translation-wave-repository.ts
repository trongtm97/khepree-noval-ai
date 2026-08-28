import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type {
  WaveCommitStatus,
  WaveResultStatus,
  WaveStatus,
} from '@shared/constants/parallel-waves';

export interface TranslationWaveRow {
  id: string;
  project_id: string;
  edition_id: string | null;
  knowledge_version: number;
  chapter_from: number;
  chapter_to: number;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface WaveJobRow {
  id: string;
  wave_id: string;
  job_id: string;
  order_index: number;
  snapshot_version: number;
  result_status: string;
  commit_status: string;
  provisional_payload: string | null;
  conflict_summary: string | null;
  created_at: string;
  updated_at: string;
}

export class TranslationWaveRepository extends BaseRepository {
  createWave(input: {
    projectId: string;
    editionId?: string | null;
    knowledgeVersion: number;
    chapterFrom: number;
    chapterTo: number;
    status?: WaveStatus;
  }): TranslationWaveRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO translation_waves (
          id, project_id, edition_id, knowledge_version,
          chapter_from, chapter_to, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.editionId ?? null,
        input.knowledgeVersion,
        input.chapterFrom,
        input.chapterTo,
        input.status ?? 'RUNNING',
        ts.created_at,
        ts.updated_at,
      );
    const created = this.getWaveById(id);
    if (!created) {
      throw new Error(`Failed to load created translation wave: ${id}`);
    }
    return created;
  }

  getWaveById(id: string): TranslationWaveRow | null {
    return (
      (this.db.prepare(`SELECT * FROM translation_waves WHERE id = ?`).get(id) as
        | TranslationWaveRow
        | undefined) ?? null
    );
  }

  listWavesByProject(projectId: string): TranslationWaveRow[] {
    return this.db
      .prepare(
        `SELECT * FROM translation_waves WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId) as TranslationWaveRow[];
  }

  updateWaveStatus(
    id: string,
    status: WaveStatus,
    patch?: { completedAt?: string | null; knowledgeVersion?: number },
  ): TranslationWaveRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE translation_waves SET
          status = ?,
          completed_at = COALESCE(?, completed_at),
          knowledge_version = COALESCE(?, knowledge_version),
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        status,
        patch?.completedAt ?? null,
        patch?.knowledgeVersion ?? null,
        now,
        id,
      );
    return this.getWaveById(id);
  }

  attachJob(input: {
    waveId: string;
    jobId: string;
    orderIndex: number;
    snapshotVersion: number;
  }): WaveJobRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO wave_jobs (
          id, wave_id, job_id, order_index, snapshot_version,
          result_status, commit_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?)`,
      )
      .run(
        id,
        input.waveId,
        input.jobId,
        input.orderIndex,
        input.snapshotVersion,
        ts.created_at,
        ts.updated_at,
      );
    const created = this.getWaveJobById(id);
    if (!created) {
      throw new Error(`Failed to load created wave job: ${id}`);
    }
    return created;
  }

  getWaveJobById(id: string): WaveJobRow | null {
    return (
      (this.db.prepare(`SELECT * FROM wave_jobs WHERE id = ?`).get(id) as
        | WaveJobRow
        | undefined) ?? null
    );
  }

  getWaveJobByJobId(jobId: string): WaveJobRow | null {
    return (
      (this.db.prepare(`SELECT * FROM wave_jobs WHERE job_id = ?`).get(jobId) as
        | WaveJobRow
        | undefined) ?? null
    );
  }

  /** Deterministic commit order: order_index ASC. */
  listWaveJobsOrdered(waveId: string): WaveJobRow[] {
    return this.db
      .prepare(
        `SELECT * FROM wave_jobs WHERE wave_id = ? ORDER BY order_index ASC`,
      )
      .all(waveId) as WaveJobRow[];
  }

  updateWaveJob(
    id: string,
    patch: {
      resultStatus?: WaveResultStatus;
      commitStatus?: WaveCommitStatus;
      provisionalPayload?: string | null;
      conflictSummary?: string | null;
    },
  ): WaveJobRow | null {
    const now = utcNow();
    const row = this.getWaveJobById(id);
    if (!row) return null;
    this.db
      .prepare(
        `UPDATE wave_jobs SET
          result_status = COALESCE(?, result_status),
          commit_status = COALESCE(?, commit_status),
          provisional_payload = CASE WHEN ? IS NOT NULL THEN ? ELSE provisional_payload END,
          conflict_summary = CASE WHEN ? IS NOT NULL THEN ? ELSE conflict_summary END,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.resultStatus ?? null,
        patch.commitStatus ?? null,
        patch.provisionalPayload !== undefined ? 1 : null,
        patch.provisionalPayload ?? null,
        patch.conflictSummary !== undefined ? 1 : null,
        patch.conflictSummary ?? null,
        now,
        id,
      );
    return this.getWaveJobById(id);
  }
}
