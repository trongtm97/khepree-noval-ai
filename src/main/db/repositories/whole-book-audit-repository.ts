import type Database from 'better-sqlite3';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { WholeBookAuditRunStatus } from '@shared/constants/whole-book-audit';
import type { TranslationRecipeMode } from '@shared/constants/translation-recipes';

export interface WholeBookAuditRunRow {
  id: string;
  project_id: string;
  edition_id: string | null;
  campaign_id: string | null;
  status: WholeBookAuditRunStatus;
  recipe_mode: string | null;
  last_chapter_index: number;
  chapters_total: number;
  findings_count: number;
  critical_count: number;
  report_json_path: string | null;
  report_html_path: string | null;
  checkpoint_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export class WholeBookAuditRepository extends BaseRepository {
  createRun(input: {
    projectId: string;
    editionId?: string | null;
    campaignId?: string | null;
    recipeMode?: TranslationRecipeMode | null;
    chaptersTotal?: number;
  }): WholeBookAuditRunRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO whole_book_audit_runs (
          id, project_id, edition_id, campaign_id, status, recipe_mode,
          last_chapter_index, chapters_total, findings_count, critical_count,
          report_json_path, report_html_path, checkpoint_json, error_message,
          created_at, updated_at, finished_at
        ) VALUES (?, ?, ?, ?, 'PENDING', ?, 0, ?, 0, 0, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
      )
      .run(
        id,
        input.projectId,
        input.editionId ?? null,
        input.campaignId ?? null,
        input.recipeMode ?? null,
        input.chaptersTotal ?? 0,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getById(id), 'whole_book_audit_run', id);
  }

  getById(id: string): WholeBookAuditRunRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM whole_book_audit_runs WHERE id = ?`)
        .get(id) as WholeBookAuditRunRow | undefined) ?? null
    );
  }

  getActiveRun(projectId: string): WholeBookAuditRunRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM whole_book_audit_runs
           WHERE project_id = ?
             AND status IN ('PENDING','INDEXING','SCANNING','REPAIRING','EXPORTING')
           ORDER BY updated_at DESC
           LIMIT 1`,
        )
        .get(projectId) as WholeBookAuditRunRow | undefined) ?? null
    );
  }

  updateRun(
    id: string,
    patch: {
      status?: WholeBookAuditRunStatus;
      lastChapterIndex?: number;
      chaptersTotal?: number;
      findingsCount?: number;
      criticalCount?: number;
      reportJsonPath?: string | null;
      reportHtmlPath?: string | null;
      checkpointJson?: string | null;
      errorMessage?: string | null;
      finishedAt?: string | null;
    },
  ): WholeBookAuditRunRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE whole_book_audit_runs SET
          status = ?,
          last_chapter_index = ?,
          chapters_total = ?,
          findings_count = ?,
          critical_count = ?,
          report_json_path = ?,
          report_html_path = ?,
          checkpoint_json = ?,
          error_message = ?,
          finished_at = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.status ?? existing.status,
        patch.lastChapterIndex ?? existing.last_chapter_index,
        patch.chaptersTotal ?? existing.chapters_total,
        patch.findingsCount ?? existing.findings_count,
        patch.criticalCount ?? existing.critical_count,
        patch.reportJsonPath !== undefined
          ? patch.reportJsonPath
          : existing.report_json_path,
        patch.reportHtmlPath !== undefined
          ? patch.reportHtmlPath
          : existing.report_html_path,
        patch.checkpointJson !== undefined
          ? patch.checkpointJson
          : existing.checkpoint_json,
        patch.errorMessage !== undefined
          ? patch.errorMessage
          : existing.error_message,
        patch.finishedAt !== undefined ? patch.finishedAt : existing.finished_at,
        utcNow(),
        id,
      );
    return this.getById(id);
  }
}

export function createWholeBookAuditRepository(
  db: Database.Database,
): WholeBookAuditRepository {
  return new WholeBookAuditRepository(db);
}
