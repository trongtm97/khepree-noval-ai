import type { DatabaseManager } from '../db/database-manager';
import { utcNow } from '../db/utils/timestamps';
import { NotebookBootstrapService } from '../notebook/notebook-bootstrap-service';
import { NotebookKnowledgeBuilder } from '../notebook/knowledge-builder';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import { logger } from '../logging/logger';

export interface AiMemoryResetResult {
  charactersDeleted: number;
  relationshipsDeleted: number;
  memoryEventsDeleted: number;
  termCandidatesDeleted: number;
  projectTermsUnlinked: number;
  projectScopedTermsDeleted: number;
  storyCleared: boolean;
  conflictsDeleted: number;
  archivesDeleted: number;
  message: string;
}

/**
 * Soft-wipe project AI memory (keep chapters + translations + notebook mapping).
 * Resets bootstrap lifecycle and rebuilds empty/seed knowledge files.
 */
export class AiMemoryResetService {
  constructor(private readonly db: DatabaseManager) {}

  reset(projectId: string): AiMemoryResetResult {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const conn = this.db.getConnection();
    const run = conn.transaction(() => {
      const relationshipsDeleted = conn
        .prepare(`DELETE FROM character_relationships WHERE project_id = ?`)
        .run(projectId).changes;

      const charactersDeleted = conn
        .prepare(`DELETE FROM characters WHERE project_id = ?`)
        .run(projectId).changes;

      const memoryEventsDeleted = conn
        .prepare(`DELETE FROM memory_events WHERE project_id = ?`)
        .run(projectId).changes;

      const termCandidatesDeleted = conn
        .prepare(`DELETE FROM term_candidates WHERE project_id = ?`)
        .run(projectId).changes;

      const projectTermsUnlinked = conn
        .prepare(`DELETE FROM project_terms WHERE project_id = ?`)
        .run(projectId).changes;

      // Remove PROJECT-scoped terms owned by this project (not GLOBAL vault).
      const projectTermIds = (
        conn
          .prepare(
            `SELECT id FROM terms WHERE scope = 'PROJECT' AND scope_ref = ? AND deleted_at IS NULL`,
          )
          .all(projectId) as Array<{ id: string }>
      ).map((r) => r.id);

      let projectScopedTermsDeleted = 0;
      for (const termId of projectTermIds) {
        conn.prepare(`DELETE FROM term_translations WHERE term_id = ?`).run(termId);
        conn.prepare(`DELETE FROM term_occurrences WHERE term_id = ?`).run(termId);
        projectScopedTermsDeleted += conn
          .prepare(`DELETE FROM terms WHERE id = ?`)
          .run(termId).changes;
      }

      const storyCleared =
        conn.prepare(`DELETE FROM story_states WHERE project_id = ?`).run(projectId)
          .changes > 0;

      const conflictsDeleted = conn
        .prepare(`DELETE FROM memory_conflicts WHERE project_id = ?`)
        .run(projectId).changes;

      const archivesDeleted = conn
        .prepare(`DELETE FROM memory_archives WHERE project_id = ?`)
        .run(projectId).changes;

      conn
        .prepare(`DELETE FROM notebook_hot_deltas WHERE project_id = ?`)
        .run(projectId);

      return {
        charactersDeleted,
        relationshipsDeleted,
        memoryEventsDeleted,
        termCandidatesDeleted,
        projectTermsUnlinked,
        projectScopedTermsDeleted,
        storyCleared,
        conflictsDeleted,
        archivesDeleted,
      };
    });

    const counts = run();

    this.db.projects.updateBootstrap(projectId, {
      bootstrap_status: 'NOT_STARTED',
      bootstrap_started_at: null,
      bootstrap_completed_at: null,
      bootstrap_through_chapter: null,
      bootstrap_chapter_count: 0,
    });

    // Light seed from book metadata so 00/profile is not empty after rebuild.
    try {
      new NotebookBootstrapService(this.db).seedFromMetadataAndEarlyChapters(projectId);
    } catch (err) {
      logger.warn('AI memory reset: metadata seed skipped', {
        err: err instanceof Error ? err.message : String(err),
        projectId,
      });
    }

    new NotebookKnowledgeBuilder(this.db).rebuildAndTrack(projectId);
    getNotebookSyncService(this.db).markDirty(projectId, 'ALL');

    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'BOOTSTRAP_STARTED',
      message: 'Đã xóa bộ nhớ AI dự án — sẵn sàng thiết lập lại.',
      metadata: { ...counts, at: utcNow() },
    });

    const message =
      `Đã xóa bộ nhớ AI: ${counts.charactersDeleted} NV, ${counts.relationshipsDeleted} QH, ` +
      `${counts.termCandidatesDeleted} ứng viên TN, ${counts.projectScopedTermsDeleted} TN dự án. ` +
      `Chương nguồn & bản dịch giữ nguyên.`;

    return { ...counts, message };
  }
}
