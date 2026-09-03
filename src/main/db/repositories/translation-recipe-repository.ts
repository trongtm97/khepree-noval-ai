import type Database from 'better-sqlite3';
import type { TranslationRecipeMode } from '@shared/constants/translation-recipes';
import type {
  TranslationCampaignProjectStatus,
  TranslationCampaignStatus,
} from '@shared/constants/translation-campaign';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface TranslationRecipeRow {
  id: string;
  name: string;
  description: string | null;
  mode: TranslationRecipeMode;
  version: string;
  config_json: string;
  cloned_from_id: string | null;
  is_builtin: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TranslationCampaignRow {
  id: string;
  title: string;
  recipe_id: string;
  recipe_snapshot_json: string;
  status: TranslationCampaignStatus;
  plan_json: string | null;
  start_token: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TranslationCampaignProjectRow {
  campaign_id: string;
  project_id: string;
  override_json: string | null;
  status: TranslationCampaignProjectStatus;
  selected: number;
  preflight_json: string | null;
  blocker_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranslationCampaignJobRow {
  campaign_id: string;
  project_id: string;
  job_id: string;
  chapter_from: number;
  chapter_to: number;
  created_at: string;
}

export class TranslationRecipeRepository extends BaseRepository {
  create(input: {
    id?: string;
    name: string;
    description?: string | null;
    mode: TranslationRecipeMode;
    version: string;
    configJson: string;
    clonedFromId?: string | null;
  }): TranslationRecipeRow {
    const id = input.id ?? newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO translation_recipes (
          id, name, description, mode, version, config_json, cloned_from_id,
          is_builtin, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`,
      )
      .run(
        id,
        input.name,
        input.description ?? null,
        input.mode,
        input.version,
        input.configJson,
        input.clonedFromId ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.getById(id)!;
  }

  getById(id: string): TranslationRecipeRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM translation_recipes WHERE id = ? AND deleted_at IS NULL`)
        .get(id) as TranslationRecipeRow | undefined) ?? null
    );
  }

  listUserRecipes(): TranslationRecipeRow[] {
    return this.db
      .prepare(
        `SELECT * FROM translation_recipes
         WHERE deleted_at IS NULL AND is_builtin = 0
         ORDER BY updated_at DESC`,
      )
      .all() as TranslationRecipeRow[];
  }

  update(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      configJson?: string;
      version?: string;
      mode?: TranslationRecipeMode;
    },
  ): TranslationRecipeRow | null {
    const existing = this.getById(id);
    if (!existing || existing.is_builtin === 1) return null;
    this.db
      .prepare(
        `UPDATE translation_recipes SET
          name = ?,
          description = ?,
          config_json = ?,
          version = ?,
          mode = ?,
          updated_at = ?
         WHERE id = ? AND deleted_at IS NULL AND is_builtin = 0`,
      )
      .run(
        patch.name ?? existing.name,
        patch.description !== undefined ? patch.description : existing.description,
        patch.configJson ?? existing.config_json,
        patch.version ?? existing.version,
        patch.mode ?? existing.mode,
        utcNow(),
        id,
      );
    return this.getById(id);
  }

  softDelete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing || existing.is_builtin === 1) return false;
    const result = this.db
      .prepare(
        `UPDATE translation_recipes SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND is_builtin = 0 AND deleted_at IS NULL`,
      )
      .run(utcNow(), utcNow(), id);
    return result.changes > 0;
  }
}

export class TranslationCampaignRepository extends BaseRepository {
  create(input: {
    title: string;
    recipeId: string;
    recipeSnapshotJson: string;
    status?: TranslationCampaignStatus;
  }): TranslationCampaignRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO translation_campaigns (
          id, title, recipe_id, recipe_snapshot_json, status,
          plan_json, start_token, started_at, paused_at, completed_at, last_error,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
      )
      .run(
        id,
        input.title,
        input.recipeId,
        input.recipeSnapshotJson,
        input.status ?? 'DRAFT',
        ts.created_at,
        ts.updated_at,
      );
    return this.getById(id)!;
  }

  getById(id: string): TranslationCampaignRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM translation_campaigns WHERE id = ? AND deleted_at IS NULL`)
        .get(id) as TranslationCampaignRow | undefined) ?? null
    );
  }

  list(limit = 200): TranslationCampaignRow[] {
    return this.db
      .prepare(
        `SELECT * FROM translation_campaigns
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as TranslationCampaignRow[];
  }

  updateCampaign(
    id: string,
    patch: {
      status?: TranslationCampaignStatus;
      planJson?: string | null;
      startToken?: string | null;
      startedAt?: string | null;
      pausedAt?: string | null;
      completedAt?: string | null;
      lastError?: string | null;
      title?: string;
    },
  ): TranslationCampaignRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE translation_campaigns SET
          title = ?,
          status = ?,
          plan_json = ?,
          start_token = ?,
          started_at = ?,
          paused_at = ?,
          completed_at = ?,
          last_error = ?,
          updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        patch.title ?? existing.title,
        patch.status ?? existing.status,
        patch.planJson !== undefined ? patch.planJson : existing.plan_json,
        patch.startToken !== undefined ? patch.startToken : existing.start_token,
        patch.startedAt !== undefined ? patch.startedAt : existing.started_at,
        patch.pausedAt !== undefined ? patch.pausedAt : existing.paused_at,
        patch.completedAt !== undefined ? patch.completedAt : existing.completed_at,
        patch.lastError !== undefined ? patch.lastError : existing.last_error,
        utcNow(),
        id,
      );
    return this.getById(id);
  }

  addOrGetProject(input: {
    campaignId: string;
    projectId: string;
    overrideJson?: string | null;
    status?: TranslationCampaignProjectStatus;
    selected?: boolean;
  }): { row: TranslationCampaignProjectRow; created: boolean } {
    const existing = this.getProjectLink(input.campaignId, input.projectId);
    if (existing) {
      return { row: existing, created: false };
    }
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO translation_campaign_projects (
          campaign_id, project_id, override_json, status, selected,
          preflight_json, blocker_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        input.campaignId,
        input.projectId,
        input.overrideJson ?? null,
        input.status ?? 'PENDING',
        input.selected === false ? 0 : 1,
        ts.created_at,
        ts.updated_at,
      );
    return { row: this.getProjectLink(input.campaignId, input.projectId)!, created: true };
  }

  setProjectOverride(input: {
    campaignId: string;
    projectId: string;
    overrideJson: string | null;
  }): TranslationCampaignProjectRow {
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO translation_campaign_projects (
          campaign_id, project_id, override_json, status, selected,
          preflight_json, blocker_code, created_at, updated_at
        ) VALUES (?, ?, ?, 'PENDING', 1, NULL, NULL, ?, ?)
        ON CONFLICT(campaign_id, project_id) DO UPDATE SET
          override_json = excluded.override_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.campaignId,
        input.projectId,
        input.overrideJson,
        ts.created_at,
        ts.updated_at,
      );
    return this.getProjectLink(input.campaignId, input.projectId)!;
  }

  updateProject(
    campaignId: string,
    projectId: string,
    patch: {
      status?: TranslationCampaignProjectStatus;
      selected?: boolean;
      preflightJson?: string | null;
      blockerCode?: string | null;
      overrideJson?: string | null;
    },
  ): TranslationCampaignProjectRow | null {
    const existing = this.getProjectLink(campaignId, projectId);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE translation_campaign_projects SET
          status = ?,
          selected = ?,
          preflight_json = ?,
          blocker_code = ?,
          override_json = ?,
          updated_at = ?
         WHERE campaign_id = ? AND project_id = ?`,
      )
      .run(
        patch.status ?? existing.status,
        patch.selected !== undefined ? (patch.selected ? 1 : 0) : existing.selected,
        patch.preflightJson !== undefined ? patch.preflightJson : existing.preflight_json,
        patch.blockerCode !== undefined ? patch.blockerCode : existing.blocker_code,
        patch.overrideJson !== undefined ? patch.overrideJson : existing.override_json,
        utcNow(),
        campaignId,
        projectId,
      );
    return this.getProjectLink(campaignId, projectId);
  }

  getProjectLink(
    campaignId: string,
    projectId: string,
  ): TranslationCampaignProjectRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM translation_campaign_projects
           WHERE campaign_id = ? AND project_id = ?`,
        )
        .get(campaignId, projectId) as TranslationCampaignProjectRow | undefined) ?? null
    );
  }

  listProjects(campaignId: string): TranslationCampaignProjectRow[] {
    return this.db
      .prepare(
        `SELECT * FROM translation_campaign_projects WHERE campaign_id = ?
         ORDER BY created_at ASC`,
      )
      .all(campaignId) as TranslationCampaignProjectRow[];
  }

  removeProject(campaignId: string, projectId: string): boolean {
    const result = this.db
      .prepare(
        `DELETE FROM translation_campaign_projects
         WHERE campaign_id = ? AND project_id = ?`,
      )
      .run(campaignId, projectId);
    return result.changes > 0;
  }

  /** Insert campaign↔job link; returns false if fingerprint already exists (idempotent). */
  tryLinkJob(input: {
    campaignId: string;
    projectId: string;
    jobId: string;
    chapterFrom: number;
    chapterTo: number;
  }): boolean {
    const existing = this.db
      .prepare(
        `SELECT job_id FROM translation_campaign_jobs
         WHERE campaign_id = ? AND project_id = ? AND chapter_from = ? AND chapter_to = ?`,
      )
      .get(
        input.campaignId,
        input.projectId,
        input.chapterFrom,
        input.chapterTo,
      ) as { job_id: string } | undefined;
    if (existing) return false;
    this.db
      .prepare(
        `INSERT INTO translation_campaign_jobs (
          campaign_id, project_id, job_id, chapter_from, chapter_to, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.campaignId,
        input.projectId,
        input.jobId,
        input.chapterFrom,
        input.chapterTo,
        utcNow(),
      );
    return true;
  }

  listJobs(campaignId: string): TranslationCampaignJobRow[] {
    return this.db
      .prepare(
        `SELECT * FROM translation_campaign_jobs WHERE campaign_id = ?
         ORDER BY created_at ASC`,
      )
      .all(campaignId) as TranslationCampaignJobRow[];
  }

  listJobIds(campaignId: string): string[] {
    return this.listJobs(campaignId).map((j) => j.job_id);
  }
}

export function createTranslationRecipeRepository(
  db: Database.Database,
): TranslationRecipeRepository {
  return new TranslationRecipeRepository(db);
}

export function createTranslationCampaignRepository(
  db: Database.Database,
): TranslationCampaignRepository {
  return new TranslationCampaignRepository(db);
}
