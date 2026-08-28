import {
  MAX_PACK_CHAPTERS,
  MIN_PACK_CHAPTERS,
  type TranslationStyle,
} from '@shared/constants/translation-pack';
import {
  resolveProjectTranslationStyle,
} from '@shared/constants/translation-style-model';
import { isPackMode, type PackMode } from '@shared/constants/pack-mode';
import { DEFAULT_NOTEBOOK_SETTINGS } from '@shared/constants/knowledge';
import type {
  ChapterSummaryDto,
  TranslationPackDto,
} from '@shared/schemas/translation-pack';
import { getDatabase } from '../db/connection';
import {
  buildTranslationPack,
  countHotDeltaLines,
} from '../prompt/translation-pack-builder';
import {
  resolveTranslationPackMode,
  type PackModeDecision,
} from '../prompt/pack-mode-resolver';
import { getMemoryService } from './memory-service-singleton';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import { loadNotebookSettings } from '../notebook/knowledge-builder';
import { logger } from '../logging/logger';

export interface TranslationPackBuildResult extends TranslationPackDto {
  packMode: PackMode;
  packTelemetry: PackModeDecision & { hotDeltaCount: number };
}

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
    /** Force slim/hybrid/fat; otherwise inferred from Notebook health + provider. */
    packMode?: PackMode;
    googleAccountId?: string | null;
    providerType?: string | null;
    /** When true, force fat pack (Web API / no notebook). */
    forceFatPack?: boolean;
  }): TranslationPackBuildResult {
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
    const decision = resolveTranslationPackMode(db, {
      projectId: input.projectId,
      accountId: input.googleAccountId,
      providerType: input.providerType,
      forceFatPack: input.forceFatPack,
    });

    const packMode: PackMode =
      input.packMode && isPackMode(input.packMode) ? input.packMode : decision.packMode;

    if (
      packMode === 'fat' &&
      decision.packMode === 'fat' &&
      decision.reason !== 'webapi_always_fat' &&
      decision.reason !== 'force_fat' &&
      decision.reason !== 'non_playwright_provider'
    ) {
      if (settings.fallbackPolicy === 'STRICT_NOTEBOOK') {
        throw new Error(
          'STRICT_NOTEBOOK: Notebook chưa sẵn sàng — tạm dừng dịch.',
        );
      }
      logger.warn('Notebook không khả dụng. NovelTrans đang sử dụng bộ nhớ cục bộ.', {
        projectId: input.projectId,
        reason: decision.reason,
        event: 'NOTEBOOK_HOT_FALLBACK',
      });
      db.knowledgeSyncEvents.insert({
        projectId: input.projectId,
        eventType: 'NOTEBOOK_HOT_FALLBACK',
        message: 'Notebook không khả dụng. NovelTrans đang sử dụng bộ nhớ cục bộ.',
      });
    }

    const tokenBudget =
      packMode === 'slim'
        ? Math.min(input.tokenBudget ?? 1500, 2000)
        : packMode === 'hybrid'
          ? Math.min(input.tokenBudget ?? 4000, 6000)
          : input.tokenBudget;

    const context = getMemoryService().buildContext({
      projectId: input.projectId,
      chapterIds: input.chapterIds,
      tokenBudget,
      recentWindow: input.recentWindow ?? settings.recentContextChapters,
    });

    const hotOverride = getNotebookSyncService(db).buildActiveHotMemoryText(
      input.projectId,
      {
        anchorChapter: context.anchorChapter,
        // Hybrid always wants delta-since-verified even if dirty flags lag.
        force: packMode === 'hybrid',
      },
    );

    const pack = buildTranslationPack(db, {
      projectId: input.projectId,
      chapterIds: input.chapterIds,
      style:
        input.style ??
        (resolveProjectTranslationStyle(
          db.projects.getStyleConfig(input.projectId),
        ) as TranslationStyle),
      context,
      extraRules: input.extraRules,
      paragraphIds: input.paragraphIds,
      packMode,
      hotMemoryOverride: hotOverride || undefined,
    });

    const hotDeltaCount = countHotDeltaLines(
      pack.sections.hotMemoryDelta,
    );

    return {
      ...pack,
      packMode,
      packTelemetry: {
        ...decision,
        packMode,
        hotDeltaCount,
      },
    };
  }
}

export { DEFAULT_NOTEBOOK_SETTINGS };
