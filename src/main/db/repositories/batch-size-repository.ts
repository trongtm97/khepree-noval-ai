import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';

export interface BatchSizeDecisionRow {
  id: string;
  project_id: string;
  job_id: string | null;
  user_max_chapters: number;
  chosen_chapters: number;
  source_characters: number;
  paragraph_count: number;
  provider_type: string | null;
  reason: string | null;
  output_ratio: number | null;
  success: number | null;
  created_at: string;
}

export interface ProjectBatchStatsRow {
  project_id: string;
  success_count: number;
  failure_count: number;
  incomplete_count: number;
  avg_output_ratio: number | null;
  updated_at: string;
}

export interface InsertBatchSizeDecisionInput {
  project_id: string;
  job_id?: string | null;
  user_max_chapters: number;
  chosen_chapters: number;
  source_characters: number;
  paragraph_count: number;
  provider_type?: string | null;
  reason?: string | null;
}

export class BatchSizeRepository extends BaseRepository {
  insertDecision(input: InsertBatchSizeDecisionInput): BatchSizeDecisionRow {
    const id = newId();
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO batch_size_decisions (
          id, project_id, job_id, user_max_chapters, chosen_chapters,
          source_characters, paragraph_count, provider_type, reason, output_ratio, success, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.job_id ?? null,
        input.user_max_chapters,
        input.chosen_chapters,
        input.source_characters,
        input.paragraph_count,
        input.provider_type ?? null,
        input.reason ?? null,
        now,
      );
    return this.getDecision(id)!;
  }

  getDecision(id: string): BatchSizeDecisionRow | null {
    return (
      this.db
        .prepare(`SELECT * FROM batch_size_decisions WHERE id = ?`)
        .get(id) as BatchSizeDecisionRow | undefined
    ) ?? null;
  }

  listRecentByProject(projectId: string, limit = 20): BatchSizeDecisionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM batch_size_decisions
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(projectId, limit) as BatchSizeDecisionRow[];
  }

  markDecisionOutcome(
    id: string,
    outcome: { success: boolean; outputRatio?: number | null },
  ): void {
    this.db
      .prepare(
        `UPDATE batch_size_decisions
         SET success = ?, output_ratio = ?
         WHERE id = ?`,
      )
      .run(outcome.success ? 1 : 0, outcome.outputRatio ?? null, id);
  }

  linkDecisionToJob(decisionId: string, jobId: string): void {
    this.db
      .prepare(`UPDATE batch_size_decisions SET job_id = ? WHERE id = ?`)
      .run(jobId, decisionId);
  }

  getProjectStats(projectId: string): ProjectBatchStatsRow | null {
    return (
      this.db
        .prepare(`SELECT * FROM project_batch_stats WHERE project_id = ?`)
        .get(projectId) as ProjectBatchStatsRow | undefined
    ) ?? null;
  }

  recordProjectOutcome(
    projectId: string,
    outcome: 'success' | 'failure' | 'incomplete',
    outputRatio?: number | null,
  ): ProjectBatchStatsRow {
    const existing = this.getProjectStats(projectId);
    const now = utcNow();
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO project_batch_stats (
            project_id, success_count, failure_count, incomplete_count, avg_output_ratio, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          projectId,
          outcome === 'success' ? 1 : 0,
          outcome === 'failure' ? 1 : 0,
          outcome === 'incomplete' ? 1 : 0,
          outputRatio ?? null,
          now,
        );
      return this.getProjectStats(projectId)!;
    }

    let success = existing.success_count;
    let failure = existing.failure_count;
    let incomplete = existing.incomplete_count;
    if (outcome === 'success') success += 1;
    if (outcome === 'failure') failure += 1;
    if (outcome === 'incomplete') incomplete += 1;

    let avgRatio = existing.avg_output_ratio;
    if (outputRatio != null && Number.isFinite(outputRatio)) {
      const total = existing.success_count + (outcome === 'success' ? 1 : 0);
      if (total <= 1) {
        avgRatio = outputRatio;
      } else if (avgRatio != null) {
        avgRatio = avgRatio + (outputRatio - avgRatio) / total;
      } else {
        avgRatio = outputRatio;
      }
    }

    this.db
      .prepare(
        `UPDATE project_batch_stats
         SET success_count = ?, failure_count = ?, incomplete_count = ?,
             avg_output_ratio = ?, updated_at = ?
         WHERE project_id = ?`,
      )
      .run(success, failure, incomplete, avgRatio, now, projectId);

    return this.getProjectStats(projectId)!;
  }
}
