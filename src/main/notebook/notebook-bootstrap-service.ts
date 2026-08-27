import type { DatabaseManager } from '../db/database-manager';
import { loadNotebookSettings, NotebookKnowledgeBuilder } from './knowledge-builder';
import { getNotebookSyncService } from './notebook-sync-service-singleton';
import { resolveTranslationNotebook } from './notebook-resolver';
import { logger } from '../logging/logger';
import { resolveProjectWorker } from '../services/project-worker-resolver';

export interface BootstrapResult {
  rebuilt: boolean;
  seeded: boolean;
  chapterCount: number;
  message: string;
}

export interface PrepareForTranslateResult {
  ready: boolean;
  usedFallback: boolean;
  message: string;
  notebookStatus: string | null;
  needsAssisted: boolean;
}

const USABLE_NOTEBOOK_STATUSES = new Set(['ready', 'sync_pending', 'stale']);

export interface PrepareForTranslateDeps {
  provision?: (input: {
    projectId: string;
    accountId: string;
  }) => Promise<{ assisted: boolean; mapping: { status: string }; message: string }>;
  syncDrive?: (projectId: string) => Promise<unknown>;
}

/**
 * Pre-translate bootstrap: rebuild knowledge files from SQLite,
 * optionally seed story/world from early chapters + book metadata.
 * Does not call Notebook write-back into SQLite as truth.
 */
export class NotebookBootstrapService {
  constructor(private readonly db: DatabaseManager) {}

  bootstrap(projectId: string, options?: { seed?: boolean }): BootstrapResult {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const settings = loadNotebookSettings(this.db, projectId);
    const doSeed = options?.seed ?? settings.seedOnBootstrap;

    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'NOTEBOOK_SEED_STARTED',
      message: `Đang xây bộ nhớ AI cho ${project.title}.`,
    });

    let seeded = false;
    let chapterCount = 0;

    if (doSeed) {
      const result = this.seedFromMetadataAndEarlyChapters(projectId);
      seeded = result.seeded;
      chapterCount = result.chapterCount;
    }

    new NotebookKnowledgeBuilder(this.db).rebuildAndTrack(projectId);
    getNotebookSyncService(this.db).markDirty(projectId, 'ALL');

    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'NOTEBOOK_SEED_COMPLETED',
      message: seeded
        ? `Đã khởi tạo bộ nhớ từ metadata + ${chapterCount} chương đầu.`
        : 'Đã xây bộ nhớ AI từ dữ liệu hiện có.',
    });

    logger.info('Notebook bootstrap complete', { projectId, seeded, chapterCount });

    return {
      rebuilt: true,
      seeded,
      chapterCount,
      message: seeded
        ? `Bộ nhớ AI đã khởi tạo (${chapterCount} chương đầu). Đồng bộ Notebook trước khi dịch.`
        : 'Bộ nhớ AI đã xây từ metadata. Đồng bộ Notebook trước khi dịch.',
    };
  }

  /**
   * Draft seed into SQLite only — candidates/draft, not GLOBAL verified.
   * Uses official summary + skim of early chapter text for open plots / location hints.
   */
  seedFromMetadataAndEarlyChapters(projectId: string): {
    seeded: boolean;
    chapterCount: number;
  } {
    const project = this.db.projects.getById(projectId);
    if (!project) return { seeded: false, chapterCount: 0 };

    const settings = loadNotebookSettings(this.db, projectId);
    const chapters = this.db.chapters
      .listByProject(projectId)
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .slice(0, settings.seedChapterCount);

    const story = this.db.storyStates.ensure(projectId);
    const structured = this.db.storyStates.parseStructured(story);

    const summaryParts: string[] = [];
    if (project.official_summary?.trim()) summaryParts.push(project.official_summary.trim());
    if (project.description?.trim() && !summaryParts.length) {
      summaryParts.push(project.description.trim());
    }

    const openPlots: string[] = [...(structured.unresolvedPlotPoints ?? [])];
    for (const chapter of chapters) {
      const paras = this.db.paragraphs.listByChapter(chapter.id).slice(0, 8);
      const snippet = paras.map((p) => p.source_text).join(' ').slice(0, 400);
      if (snippet) {
        openPlots.push(
          `Ch.${chapter.chapter_number ?? chapter.sequence_order}: ${snippet.slice(0, 120)}…`,
        );
      }
    }

    const world: Record<string, unknown> = {
      ...(structured.worldKnowledge ?? {}),
    };
    if (project.genre) world.genre = project.genre;
    if (project.subgenres) {
      try {
        world.subgenres = JSON.parse(project.subgenres);
      } catch {
        world.subgenres = project.subgenres;
      }
    }
    world.notes ??=
      'World knowledge seeded from project metadata. Refine after translation / research.';

    if (story.locked === 1) {
      return { seeded: false, chapterCount: chapters.length };
    }

    const seededSummary =
      structured.summaryText?.trim() ??
      (summaryParts.length > 0 ? summaryParts.join('\n\n').slice(0, 2000) : null);

    this.db.storyStates.patch(projectId, {
      summaryText: seededSummary ?? structured.summaryText,
      unresolvedPlotPoints: openPlots.slice(0, 30),
      worldKnowledge: world,
      currentChapterNumber: structured.currentChapterNumber ?? null,
    });

    getNotebookSyncService(this.db).markDirty(
      projectId,
      'STORY_STATE_CHANGED',
      'Bootstrap seed: story state + world from metadata / early chapters',
    );
    getNotebookSyncService(this.db).markDirty(projectId, 'WORLD_KNOWLEDGE_CHANGED');

    return { seeded: true, chapterCount: chapters.length };
  }

  /** Build a research seed prompt (for optional AI research — not auto-applied as verified). */
  buildSeedResearchPrompt(projectId: string): string {
    const settings = loadNotebookSettings(this.db, projectId);
    const chapters = this.db.chapters
      .listByProject(projectId)
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .slice(0, settings.seedChapterCount);

    const lines: string[] = [
      '## Research Task (NOT translation)',
      'Read the source excerpts and return JSON only (no markdown fences):',
      '{',
      '  "storySummary": "...",',
      '  "mainCharacters": [{"nameCn":"...","nameVi":"...","role":"..."}],',
      '  "world": {"factions":[],"places":[],"cultivationSystem":"..."},',
      '  "openPlots": ["..."]',
      '}',
      'Do not invent beyond the excerpts. Candidates only — human will review.',
      '',
      '## Source excerpts',
    ];

    for (const chapter of chapters) {
      lines.push(`### Chapter ${chapter.chapter_number ?? chapter.sequence_order}`);
      for (const para of this.db.paragraphs.listByChapter(chapter.id).slice(0, 40)) {
        lines.push(para.source_text);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  applySeedResearchJson(projectId: string, raw: string): { ok: boolean; message: string } {
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start < 0 || end <= start) {
        return { ok: false, message: 'No JSON object in seed response' };
      }
      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        storySummary?: string;
        mainCharacters?: { nameCn?: string; nameVi?: string; role?: string }[];
        world?: Record<string, unknown>;
        openPlots?: string[];
      };

      const story = this.db.storyStates.ensure(projectId);
      if (story.locked === 1) {
        return { ok: false, message: 'Story state locked' };
      }

      this.db.storyStates.patch(projectId, {
        summaryText: parsed.storySummary,
        unresolvedPlotPoints: parsed.openPlots,
        worldKnowledge: parsed.world ?? undefined,
      });

      for (const ch of parsed.mainCharacters ?? []) {
        if (!ch.nameCn?.trim()) continue;
        const existing = this.db.characters.listByProject(projectId).find(
          (c) => c.canonical_name === ch.nameCn,
        );
        if (existing) continue;
        this.db.characters.create({
          project_id: projectId,
          canonical_name: ch.nameCn.trim(),
          translated_name: ch.nameVi?.trim() ?? null,
          role: ch.role?.trim() ?? null,
        });
      }

      getNotebookSyncService(this.db).markDirty(projectId, 'ALL');
      new NotebookKnowledgeBuilder(this.db).rebuildAndTrack(projectId);
      return { ok: true, message: 'Seed research applied as draft (not verified terms)' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Explicit pre-translate Notebook prepare: bootstrap if empty → rebuild →
   * Drive sync when possible → best-effort provision. Never blocks forever on
   * assisted/fail — returns usedFallback so translate can continue with fat-pack.
   */
  async prepareForTranslate(
    projectId: string,
    options?: { accountId?: string | null },
    deps?: PrepareForTranslateDeps,
  ): Promise<PrepareForTranslateResult> {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const sync = getNotebookSyncService(this.db);
    const knowledgeFiles = this.db.knowledgeFiles.listByProject(projectId);
    const knowledgeEmpty =
      knowledgeFiles.length === 0 ||
      knowledgeFiles.every((f) => !f.content_hash && f.local_version === 0);

    if (knowledgeEmpty) {
      const status = project.bootstrap_status;
      // Never force AI bootstrap here — local seed only when not explicitly skipped.
      if (status !== 'SKIPPED') {
        this.bootstrap(projectId, { seed: true });
      } else {
        new NotebookKnowledgeBuilder(this.db).rebuildAndTrack(projectId);
        sync.markDirty(projectId, 'ALL');
      }
    } else {
      sync.rebuildKnowledge(projectId);
      if (this.db.knowledgeFiles.anyDirty(projectId)) {
        sync.markDirty(projectId, 'ALL');
      }
    }

    const driveState = this.db.driveSyncState.getByProject(projectId);
    // Explicit options.accountId is absolute for this call (setWorker / UI).
    // Otherwise use canonical ProjectWorkerResolver — never first READY blindly.
    const accountId =
      options?.accountId ??
      resolveProjectWorker(this.db, {
        projectId,
        purpose: 'notebook',
      }).accountId ??
      null;

    let driveSynced = false;
    if (accountId || driveState?.google_account_id) {
      try {
        if (deps?.syncDrive) {
          await deps.syncDrive(projectId);
        } else {
          await sync.syncDrive(projectId);
        }
        driveSynced = true;
      } catch (error) {
        logger.warn('prepareForTranslate Drive sync failed; continuing', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let notebookStatus: string | null = null;
    let needsAssisted = false;
    let usedFallback = true;
    let message = driveSynced
      ? 'Đã chuẩn bị bộ nhớ AI (Drive). Dịch sẽ dùng fat-pack nếu Notebook chưa sẵn sàng.'
      : 'Đã chuẩn bị bộ nhớ AI cục bộ. Dịch sẽ dùng fat-pack nếu Notebook chưa sẵn sàng.';

    if (accountId) {
      const mapping = resolveTranslationNotebook(this.db, projectId, accountId);
      notebookStatus = mapping?.status ?? null;

      if (mapping && USABLE_NOTEBOOK_STATUSES.has(mapping.status)) {
        usedFallback = false;
        message = `Bộ nhớ AI sẵn sàng (Translation Notebook: ${mapping.status}).`;
      } else {
        const workerReady = this.isWorkerReady(accountId);
        if (workerReady) {
          try {
            const provision =
              deps?.provision ??
              (async (input) => {
                const { getNotebookService } = await import(
                  '../services/notebook-service-singleton'
                );
                return getNotebookService().provision({
                  ...input,
                  role: 'TRANSLATION',
                });
              });
            const result = await provision({ projectId, accountId });
            notebookStatus = result.mapping.status;
            if (result.assisted) {
              needsAssisted = true;
              usedFallback = true;
              message =
                result.message ||
                'Notebook cần thao tác trên trình duyệt — tiếp tục dịch với fat-pack.';
            } else if (USABLE_NOTEBOOK_STATUSES.has(result.mapping.status)) {
              usedFallback = false;
              message = result.message || 'Notebook đã thiết lập.';
            } else {
              usedFallback = true;
              message =
                result.message ||
                'Notebook chưa sẵn sàng — tiếp tục dịch với fat-pack.';
            }
          } catch (error) {
            usedFallback = true;
            needsAssisted = false;
            message = `Không provision Notebook (${error instanceof Error ? error.message : String(error)}) — tiếp tục với fat-pack.`;
            logger.warn('prepareForTranslate provision failed; fat-pack fallback', {
              projectId,
              accountId,
              error: message,
            });
          }
        }
      }
    }

    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'NOTEBOOK_PREPARE_FOR_TRANSLATE',
      message,
    });

    return {
      ready: true,
      usedFallback,
      message,
      notebookStatus,
      needsAssisted,
    };
  }

  private isWorkerReady(accountId: string): boolean {
    const worker = this.db.workerStates
      .listEnabled()
      .find((w) => w.google_account_id === accountId);
    return worker?.health.toUpperCase() === 'READY';
  }
}
