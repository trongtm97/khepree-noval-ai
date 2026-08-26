import type { DatabaseManager } from '../db/database-manager';
import { toTermCandidateDto } from '../services/term-dto';
import type { TermCandidateDto } from '@shared/schemas/term';

export interface LearningDashboardDto {
  projectId: string;
  newTerms: TermCandidateDto[];
  conflicts: {
    id: string;
    entityType: string;
    fieldKey: string;
    existingValue: string | null;
    proposedValue: string | null;
    status: string;
    createdAt: string;
  }[];
  promotions: {
    id: string;
    eventType: string;
    payload: Record<string, unknown> | null;
    createdAt: string;
  }[];
  recentMemories: {
    id: string;
    category: string;
    key: string;
    value: string | null;
    chapterNumber: number | null;
    updatedAt: string;
  }[];
  stats: {
    pendingCandidates: number;
    pendingConflicts: number;
    archives: number;
    chaptersSinceSync: number;
    syncEveryNChapters: number;
  };
}

export class LearningService {
  constructor(private readonly db: DatabaseManager) {}

  getDashboard(projectId: string): LearningDashboardDto {
    const newTerms = this.db.termCandidates
      .listPending(projectId, 50)
      .map((row) => toTermCandidateDto(row));

    const conflicts = this.db.memoryConflicts.listPending(projectId).map((c) => ({
      id: c.id,
      entityType: c.entity_type,
      fieldKey: c.field_key,
      existingValue: c.existing_value,
      proposedValue: c.proposed_value,
      status: c.status,
      createdAt: c.created_at,
    }));

    const promotionEvents = this.db.learningEvents.listByProject(projectId, {
      limit: 40,
    });
    const promotions = promotionEvents
      .filter((e) =>
        ['term_confirm', 'promotion', 'term_candidate', 'consolidate', 'drive_sync'].includes(
          e.event_type,
        ),
      )
      .slice(0, 30)
      .map((e) => ({
        id: e.id,
        eventType: e.event_type,
        payload: parsePayload(e.payload),
        createdAt: e.created_at,
      }));

    // Also surface recent human GLOBAL/GENRE promotions from vault
    const recentVerified = this.db.terms
      .search({ projectId, limit: 20 })
      .filter((t) =>
        ['PROJECT_VERIFIED', 'GENRE_VERIFIED', 'GLOBAL_VERIFIED'].includes(t.status),
      )
      .slice(0, 10);

    for (const term of recentVerified) {
      if (promotions.some((p) => p.payload?.termId === term.id)) continue;
      promotions.unshift({
        id: `term:${term.id}`,
        eventType: 'promotion',
        payload: {
          termId: term.id,
          source: term.source_simplified,
          status: term.status,
          scope: term.scope,
        },
        createdAt: term.updated_at,
      });
    }

    const recentMemories = this.db.memoryEvents.listRecent(projectId, 40).map((m) => ({
      id: m.id,
      category: m.category,
      key: m.event_key,
      value: m.event_value,
      chapterNumber: m.chapter_number,
      updatedAt: m.updated_at,
    }));

    const sync = this.db.driveSyncState.ensure(projectId);

    return {
      projectId,
      newTerms,
      conflicts,
      promotions: promotions.slice(0, 40),
      recentMemories,
      stats: {
        pendingCandidates: newTerms.length,
        pendingConflicts: conflicts.length,
        archives: this.db.memoryArchives.listByProject(projectId, 5).length,
        chaptersSinceSync: sync.chapters_since_sync,
        syncEveryNChapters: sync.sync_every_n_chapters,
      },
    };
  }
}

function parsePayload(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
