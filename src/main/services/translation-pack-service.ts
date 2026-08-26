import {
  MAX_PACK_CHAPTERS,
  MIN_PACK_CHAPTERS,
  type TranslationStyle,
} from '@shared/constants/translation-pack';
import { NOTEBOOK_USABLE_FOR_SLIM_PACK, type NotebookStatus } from '@shared/constants/notebook';
import { DEFAULT_NOTEBOOK_SETTINGS } from '@shared/constants/knowledge';
import type {
  ChapterSummaryDto,
  TranslationPackDto,
} from '@shared/schemas/translation-pack';
import { getDatabase } from '../db/connection';
import { buildTranslationPack } from '../prompt/translation-pack-builder';
import { getMemoryService } from './memory-service-singleton';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import { loadNotebookSettings } from '../notebook/knowledge-builder';
import { logger } from '../logging/logger';

export class TranslationPackService {
  listChapters(projectId: string): ChapterSummaryDto[] {
    const db = getDatabase();
    return db.chapters.listByProject(projectId).map((chapter) => {
      const paragraphs = db.paragraphs.listByChapter(chapter.id);
      const characterCount = paragraphs.reduce(
        (sum, paragraph) => sum + paragraph.source_text.length,
        0,
      );
      return {
        id: chapter.id,
        chapterNumber: chapter.chapter_number,
        sequenceOrder: chapter.sequence_order,
        displayTitle: chapter.display_title,
        chapterType: chapter.chapter_type,
        title: chapter.display_title ?? chapter.chapter_title,
        characterCount,
        paragraphCount: paragraphs.length,
        status: chapter.status,
        sourceStatus: chapter.source_status,
      };
    });
  }

  build(input: {
    projectId: string;
    chapterIds: string[];
    style?: TranslationStyle;
    tokenBudget?: number;
    recentWindow?: number;
    extraRules?: string[];
    paragraphIds?: string[];
    /** Force slim/fat; otherwise inferred from Notebook health. */
    packMode?: 'slim' | 'fat';
    googleAccountId?: string | null;
    /** When true, force fat pack (Web API / no notebook). */
    forceFatPack?: boolean;
  }): TranslationPackDto {
    if (
      input.chapterIds.length < MIN_PACK_CHAPTERS ||
      input.chapterIds.length > MAX_PACK_CHAPTERS
    ) {
      throw new Error(
        `chapterIds must contain ${MIN_PACK_CHAPTERS}–${MAX_PACK_CHAPTERS} chapters`,
      );
    }

    const db = getDatabase();
    const project = db.projects.getById(input.projectId);
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`);
    }

    const settings = loadNotebookSettings(db, input.projectId);
    const health = getNotebookSyncService(db).getHealth(
      input.projectId,
      input.googleAccountId,
    );
    const notebookStatus = health.status as NotebookStatus;
    const canSlim =
      !input.forceFatPack &&
      NOTEBOOK_USABLE_FOR_SLIM_PACK.has(notebookStatus);

    const packMode: 'slim' | 'fat' = input.packMode ?? (canSlim ? 'slim' : 'fat');

    if (packMode === 'fat' && !canSlim) {
      if (settings.fallbackPolicy === 'STRICT_NOTEBOOK') {
        throw new Error(
          'STRICT_NOTEBOOK: Notebook chưa sẵn sàng — tạm dừng dịch.',
        );
      }
      logger.warn('Notebook không khả dụng. NovelTrans đang sử dụng bộ nhớ cục bộ.', {
        projectId: input.projectId,
        notebookStatus,
        event: 'NOTEBOOK_HOT_FALLBACK',
      });
      db.knowledgeSyncEvents.insert({
        projectId: input.projectId,
        eventType: 'NOTEBOOK_HOT_FALLBACK',
        message: 'Notebook không khả dụng. NovelTrans đang sử dụng bộ nhớ cục bộ.',
      });
    }

    const context = getMemoryService().buildContext({
      projectId: input.projectId,
      chapterIds: input.chapterIds,
      tokenBudget:
        packMode === 'slim'
          ? Math.min(input.tokenBudget ?? 1500, 2000)
          : input.tokenBudget,
      recentWindow: input.recentWindow ?? settings.recentContextChapters,
    });

    const hotOverride = getNotebookSyncService(db).buildActiveHotMemoryText(
      input.projectId,
    );

    return buildTranslationPack(db, {
      projectId: input.projectId,
      chapterIds: input.chapterIds,
      style: input.style ?? 'balanced',
      context,
      extraRules: input.extraRules,
      paragraphIds: input.paragraphIds,
      packMode,
      hotMemoryOverride: hotOverride || undefined,
    });
  }
}

export { DEFAULT_NOTEBOOK_SETTINGS };
