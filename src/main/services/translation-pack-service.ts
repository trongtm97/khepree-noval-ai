import {
  MAX_PACK_CHAPTERS,
  MIN_PACK_CHAPTERS,
  type TranslationStyle,
} from '@shared/constants/translation-pack';
import { resolveProjectTranslationStyle } from '@shared/constants/translation-style-model';
import {
  isPackMode,
  normalizePackMode,
  type PackMode,
} from '@shared/constants/pack-mode';
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
import { DEFAULT_CONTEXT_TOKEN_BUDGET } from '@shared/constants/memory';
import { buildActiveHotMemoryText } from '../notebook/hot-memory-builder';
import { loadNotebookSettings } from '../notebook/knowledge-builder';
import { resolveEditionMemoryContext } from '../memory/edition-memory';
import {
  getProjectKnowledgeVersion,
  resolveJobKnowledgeSnapshot,
} from '../knowledge/knowledge-version';

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
      const translations = db.translations.listByChapter(chapter.id);
      const hasTranslation = translations.some(
        (t) => t.translated_text != null && t.translated_text.trim().length > 0,
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
        updatedAt: chapter.updated_at,
        hasTranslation,
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
    /** Default local_context. notebook_assisted only when explicit. */
    packMode?: PackMode | 'slim' | 'hybrid' | 'fat';
    googleAccountId?: string | null;
    /** Telemetry only — does not change pack content (Phase 4 provider-neutral). */
    providerType?: string | null;
    editionId?: string;
    /** @deprecated No effect — always local context. */
    forceFatPack?: boolean;
    /** Stamp wave snapshot / job start version for parallel waves. */
    jobId?: string;
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
    const preferNotebook = input.packMode === 'notebook_assisted';
    const snapshotVersion = input.jobId
      ? resolveJobKnowledgeSnapshot(db, input.jobId, input.projectId)
      : getProjectKnowledgeVersion(db, input.projectId);
    const decision = resolveTranslationPackMode(db, {
      projectId: input.projectId,
      accountId: input.googleAccountId,
      providerType: input.providerType,
      preferNotebookPack: preferNotebook,
    });
    const decisionWithSnapshot = {
      ...decision,
      localKnowledgeVersion: snapshotVersion,
    };

    const packMode: PackMode =
      input.packMode && isPackMode(input.packMode)
        ? input.packMode
        : input.packMode
          ? normalizePackMode(input.packMode)
          : decision.packMode;

    const tokenBudget = input.tokenBudget ?? DEFAULT_CONTEXT_TOKEN_BUDGET;
    const edition = resolveEditionMemoryContext(db, input.projectId, input.editionId);

    const context = getMemoryService().buildContext({
      projectId: input.projectId,
      chapterIds: input.chapterIds,
      tokenBudget,
      recentWindow: input.recentWindow ?? settings.recentContextChapters,
      editionId: edition.editionId,
    });

    const hotOverride = buildActiveHotMemoryText(db, input.projectId, {
      anchorChapter: context.anchorChapter,
      force: true,
      localLearningMode: true,
    });

    const editionRow = db.translationEditions.getById(edition.editionId);

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
      sourceLanguage: project.source_language ?? undefined,
      targetLanguage: editionRow?.target_language ?? project.target_language ?? undefined,
    });

    const hotDeltaCount = countHotDeltaLines(pack.sections.hotMemoryDelta);

    return {
      ...pack,
      packMode,
      packTelemetry: {
        ...decisionWithSnapshot,
        packMode,
        hotDeltaCount,
      },
    };
  }
}

export { DEFAULT_NOTEBOOK_SETTINGS };
