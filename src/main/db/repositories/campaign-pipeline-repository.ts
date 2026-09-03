import type Database from 'better-sqlite3';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type {
  CampaignPipelineRunStatus,
  CampaignPipelineStage,
  CampaignPipelineStageStatus,
} from '@shared/constants/campaign-pipeline';
import type { TranslationRecipeMode } from '@shared/constants/translation-recipes';
import type {
  CampaignPipelineCheckpoint,
  CampaignPipelineSideEffects,
} from '@shared/schemas/campaign-pipeline';

export interface CampaignPipelineRunRow {
  id: string;
  campaign_id: string;
  project_id: string;
  current_stage: CampaignPipelineStage;
  status: CampaignPipelineRunStatus;
  recipe_mode: TranslationRecipeMode;
  start_token: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignPipelineStageRow {
  id: string;
  run_id: string;
  stage: CampaignPipelineStage;
  status: CampaignPipelineStageStatus;
  attempt: number;
  idempotency_key: string;
  input_json: string | null;
  output_json: string | null;
  checkpoint_json: string | null;
  side_effects_json: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class CampaignPipelineRepository extends BaseRepository {
  createRun(input: {
    campaignId: string;
    projectId: string;
    recipeMode: TranslationRecipeMode;
    startToken: string;
    currentStage?: CampaignPipelineStage;
    status?: CampaignPipelineRunStatus;
  }): CampaignPipelineRunRow {
    const existing = this.getRunByFingerprint(
      input.campaignId,
      input.projectId,
      input.startToken,
    );
    if (existing) return existing;

    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO campaign_pipeline_runs (
          id, campaign_id, project_id, current_stage, status, recipe_mode,
          start_token, error_code, error_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        input.campaignId,
        input.projectId,
        input.currentStage ?? 'INTAKE',
        input.status ?? 'PENDING',
        input.recipeMode,
        input.startToken,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getRunById(id), 'campaign_pipeline_run', id);
  }

  getRunById(id: string): CampaignPipelineRunRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM campaign_pipeline_runs WHERE id = ?`)
        .get(id) as CampaignPipelineRunRow | undefined) ?? null
    );
  }

  getRunByFingerprint(
    campaignId: string,
    projectId: string,
    startToken: string,
  ): CampaignPipelineRunRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM campaign_pipeline_runs
           WHERE campaign_id = ? AND project_id = ? AND start_token = ?`,
        )
        .get(campaignId, projectId, startToken) as
        | CampaignPipelineRunRow
        | undefined) ?? null
    );
  }

  listRunsByCampaign(campaignId: string): CampaignPipelineRunRow[] {
    return this.db
      .prepare(
        `SELECT * FROM campaign_pipeline_runs
         WHERE campaign_id = ?
         ORDER BY created_at ASC`,
      )
      .all(campaignId) as CampaignPipelineRunRow[];
  }

  listActiveRuns(): CampaignPipelineRunRow[] {
    return this.db
      .prepare(
        `SELECT * FROM campaign_pipeline_runs
         WHERE status IN ('PENDING', 'RUNNING', 'FAILED_RETRYABLE')
         ORDER BY updated_at ASC`,
      )
      .all() as CampaignPipelineRunRow[];
  }

  updateRun(
    id: string,
    patch: {
      currentStage?: CampaignPipelineStage;
      status?: CampaignPipelineRunStatus;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): CampaignPipelineRunRow | null {
    const existing = this.getRunById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE campaign_pipeline_runs SET
          current_stage = ?,
          status = ?,
          error_code = ?,
          error_message = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.currentStage ?? existing.current_stage,
        patch.status ?? existing.status,
        patch.errorCode !== undefined ? patch.errorCode : existing.error_code,
        patch.errorMessage !== undefined
          ? patch.errorMessage
          : existing.error_message,
        utcNow(),
        id,
      );
    return this.getRunById(id);
  }

  ensureStage(input: {
    runId: string;
    stage: CampaignPipelineStage;
    idempotencyKey: string;
    attempt?: number;
    inputJson?: string | null;
  }): CampaignPipelineStageRow {
    const byKey = this.getStageByIdempotencyKey(input.idempotencyKey);
    if (byKey) return byKey;

    const existing = this.getStage(input.runId, input.stage);
    if (existing) return existing;

    const id = newId();
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO campaign_pipeline_stages (
          id, run_id, stage, status, attempt, idempotency_key,
          input_json, output_json, checkpoint_json, side_effects_json,
          error_code, error_message, started_at, finished_at, updated_at
        ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?)`,
      )
      .run(
        id,
        input.runId,
        input.stage,
        input.attempt ?? 1,
        input.idempotencyKey,
        input.inputJson ?? null,
        now,
      );
    return this.assertRow(
      this.getStageById(id),
      'campaign_pipeline_stage',
      id,
    );
  }

  getStageById(id: string): CampaignPipelineStageRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM campaign_pipeline_stages WHERE id = ?`)
        .get(id) as CampaignPipelineStageRow | undefined) ?? null
    );
  }

  getStage(
    runId: string,
    stage: CampaignPipelineStage,
  ): CampaignPipelineStageRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM campaign_pipeline_stages WHERE run_id = ? AND stage = ?`,
        )
        .get(runId, stage) as CampaignPipelineStageRow | undefined) ?? null
    );
  }

  getStageByIdempotencyKey(key: string): CampaignPipelineStageRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM campaign_pipeline_stages WHERE idempotency_key = ?`,
        )
        .get(key) as CampaignPipelineStageRow | undefined) ?? null
    );
  }

  listStages(runId: string): CampaignPipelineStageRow[] {
    return this.db
      .prepare(
        `SELECT * FROM campaign_pipeline_stages
         WHERE run_id = ?
         ORDER BY stage ASC`,
      )
      .all(runId) as CampaignPipelineStageRow[];
  }

  updateStage(
    id: string,
    patch: {
      status?: CampaignPipelineStageStatus;
      attempt?: number;
      idempotencyKey?: string;
      inputJson?: string | null;
      outputJson?: string | null;
      checkpointJson?: string | null;
      sideEffectsJson?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      startedAt?: string | null;
      finishedAt?: string | null;
    },
  ): CampaignPipelineStageRow | null {
    const existing = this.getStageById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE campaign_pipeline_stages SET
          status = ?,
          attempt = ?,
          idempotency_key = ?,
          input_json = ?,
          output_json = ?,
          checkpoint_json = ?,
          side_effects_json = ?,
          error_code = ?,
          error_message = ?,
          started_at = ?,
          finished_at = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.status ?? existing.status,
        patch.attempt ?? existing.attempt,
        patch.idempotencyKey ?? existing.idempotency_key,
        patch.inputJson !== undefined ? patch.inputJson : existing.input_json,
        patch.outputJson !== undefined ? patch.outputJson : existing.output_json,
        patch.checkpointJson !== undefined
          ? patch.checkpointJson
          : existing.checkpoint_json,
        patch.sideEffectsJson !== undefined
          ? patch.sideEffectsJson
          : existing.side_effects_json,
        patch.errorCode !== undefined ? patch.errorCode : existing.error_code,
        patch.errorMessage !== undefined
          ? patch.errorMessage
          : existing.error_message,
        patch.startedAt !== undefined ? patch.startedAt : existing.started_at,
        patch.finishedAt !== undefined ? patch.finishedAt : existing.finished_at,
        utcNow(),
        id,
      );
    return this.getStageById(id);
  }

  parseCheckpoint(row: CampaignPipelineStageRow): CampaignPipelineCheckpoint {
    return parseJson<CampaignPipelineCheckpoint>(row.checkpoint_json) ?? {};
  }

  parseSideEffects(row: CampaignPipelineStageRow): CampaignPipelineSideEffects {
    return parseJson<CampaignPipelineSideEffects>(row.side_effects_json) ?? {};
  }
}

export function createCampaignPipelineRepository(
  db: Database.Database,
): CampaignPipelineRepository {
  return new CampaignPipelineRepository(db);
}
