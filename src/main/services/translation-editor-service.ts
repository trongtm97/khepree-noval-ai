import type { DatabaseManager } from '../db/database-manager';
import {
  buildTermMatchIndex,
  matchKnownTermsInText,
  type TermMatchContext,
} from '../terms/term-matcher';
import { getRecentMemory } from '../memory/recent-memory';
import type {
  EditorContextResponseSchema,
  EditorGetChapterResponseSchema,
  EditorParagraphDto,
  EditorVersionDtoSchema,
} from '@shared/schemas/translation-editor';
import type { TranslationVersionSource } from '@shared/constants/translation-editor';
import type { z } from 'zod';
import { resolveActiveEditionId } from './edition-service';

type EditorChapterResponse = z.infer<typeof EditorGetChapterResponseSchema>;
type EditorContextResponse = z.infer<typeof EditorContextResponseSchema>;
type EditorVersionDto = z.infer<typeof EditorVersionDtoSchema>;

export class TranslationEditorService {
  constructor(private readonly db: DatabaseManager) {}

  getChapter(projectId: string, chapterId: string): EditorChapterResponse {
    const chapter = this.db.chapters.getById(chapterId);
    if (chapter?.project_id !== projectId) {
      throw new Error('Chapter not found for project');
    }

    const project = this.db.projects.getById(projectId);
    const matchContext: TermMatchContext = {
      projectId,
      genre: project?.genre ?? null,
      sourceLanguage: project?.source_language,
      targetLanguage: project?.target_language,
    };
    const termRows = this.db.terms.listForMatching(matchContext);
    const termIndex = buildTermMatchIndex(termRows, {
      sourceLanguage: matchContext.sourceLanguage,
    });

    const paragraphs = this.db.paragraphs.listByChapter(chapterId);
    const qaChapterRef = chapter.chapter_number ?? chapter.sequence_order;
    const qaSummary = this.loadQaSummary(projectId, qaChapterRef);
    const editionId = resolveActiveEditionId(this.db, projectId);

    const missingSet = new Set(qaSummary?.missingParagraphIds ?? []);

    const dtos: EditorParagraphDto[] = paragraphs.map((para) => {
      const translation = this.db.translations.getByParagraphId(para.id, editionId);
      const matches = matchKnownTermsInText(
        para.source_text,
        termIndex,
        termRows,
        matchContext,
      );

      const warnings: string[] = [];
      if (missingSet.has(para.paragraph_id)) {
        warnings.push('Missing in last QA pass');
      }
      if (translation?.translated_text === '' || translation?.translated_text === null) {
        warnings.push('Empty translation');
      }

      return {
        id: para.id,
        stableParagraphId: para.paragraph_id,
        sequence: para.sequence,
        sourceText: para.source_text,
        translationId: translation?.id ?? null,
        translatedText: translation?.translated_text ?? null,
        status: mapStatus(translation?.status, warnings),
        versionSource:
          translation && isVersionSource(translation.version_source)
            ? translation.version_source
            : null,
        humanLocked: translation?.human_locked === 1,
        qaWarnings: warnings,
        termHighlights: matches.map((m) => ({
          sourceText: m.sourceText,
          termId: m.term.id,
          preferredTranslation: this.db.terms.getPrimaryTranslation(m.term.id),
          termType: m.term.term_type,
          scope: m.scope,
          confidence: m.term.confidence,
          startIndex: m.startIndex,
          endIndex: m.endIndex,
        })),
      };
    });

    return {
      projectId,
      chapterId,
      chapterNumber: chapter.chapter_number ?? chapter.sequence_order,
      chapterTitle: chapter.display_title ?? chapter.chapter_title,
      chapterStatus: chapter.status,
      paragraphs: dtos,
      qaSummary,
    };
  }

  saveHumanParagraph(
    projectId: string,
    chapterId: string,
    stableParagraphId: string,
    translatedText: string,
  ): { paragraph: EditorParagraphDto; savedAt: string } {
    const chapter = this.db.chapters.getById(chapterId);
    if (chapter?.project_id !== projectId) {
      throw new Error('Chapter not found for project');
    }

    const para = this.db.paragraphs
      .listByChapter(chapterId)
      .find((p) => p.paragraph_id === stableParagraphId);
    if (!para) throw new Error(`Paragraph not found: ${stableParagraphId}`);

    this.db.translations.saveHumanEdit(
      para.id,
      translatedText,
      resolveActiveEditionId(this.db, projectId),
    );

    const refreshed = this.getChapter(projectId, chapterId);
    const paragraph = refreshed.paragraphs.find(
      (p) => p.stableParagraphId === stableParagraphId,
    );
    if (!paragraph) throw new Error('Failed to reload paragraph after save');

    return { paragraph, savedAt: new Date().toISOString() };
  }

  listVersions(translationId: string): EditorVersionDto[] {
    return this.db.translations.listVersions(translationId).map((v) => ({
      version: v.version,
      translatedText: v.translated_text,
      status: v.status,
      versionSource: isVersionSource(v.version_source) ? v.version_source : 'AI_INITIAL',
      createdAt: v.created_at,
      editorNote: v.editor_note,
    }));
  }

  revertVersion(
    projectId: string,
    chapterId: string,
    translationId: string,
    version: number,
  ): EditorParagraphDto | null {
    this.db.translations.revertToVersion(translationId, version);
    const refreshed = this.getChapter(projectId, chapterId);
    return refreshed.paragraphs.find((p) => p.translationId === translationId) ?? null;
  }

  getContext(projectId: string, chapterNumber: number): EditorContextResponse {
    const project = this.db.projects.getById(projectId);
    const editionId = project?.active_edition_id ?? undefined;
    const edition = editionId
      ? this.db.translationEditions.getById(editionId)
      : null;

    const characters = this.db.characters.listByProject(projectId).slice(0, 40).map((c) => ({
      id: c.id,
      canonicalName: c.canonical_name,
      translatedName:
        editionId != null
          ? this.db.characterTranslations.getByCharacterAndEdition(c.id, editionId)
              ?.preferred_name ?? c.translated_name
          : c.translated_name,
      role: c.role,
    }));

    const relationships = this.db.relationships
      .listActiveAtChapter(projectId, chapterNumber)
      .slice(0, 30)
      .map((rel) => {
        const from = this.db.characters.getById(rel.from_character_id);
        const to = this.db.characters.getById(rel.to_character_id);
        const tr =
          editionId != null
            ? this.db.relationshipTranslations.getByRelationshipAndEdition(rel.id, editionId)
            : null;
        return {
          id: rel.id,
          fromName: from?.canonical_name ?? rel.from_character_id,
          toName: to?.canonical_name ?? rel.to_character_id,
          type: rel.relationship_type,
          aCallsB: tr?.a_calls_b ?? rel.a_calls_b,
          bCallsA: tr?.b_calls_a ?? rel.b_calls_a,
        };
      });

    const termRows = this.db.terms.listForMatching({
      projectId,
      sourceLanguage: project?.source_language,
      targetLanguage: edition?.target_language ?? project?.target_language,
    });
    const terms = termRows.slice(0, 40).map((t) => ({
      id: t.id,
      sourceText: t.source_text ?? t.source_simplified,
      translation: this.db.terms.getPrimaryTranslation(t.id),
      scope: t.scope,
      confidence: t.confidence,
    }));

    const storyState = this.db.storyStates.getByProject(projectId);
    const recent = getRecentMemory(this.db, projectId, chapterNumber, 5);
    const memorySnippet = [
      storyState?.summary_text,
      ...recent.events.map((e) => e.event_value).filter(Boolean),
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 2000);

    return {
      characters,
      relationships,
      terms,
      memorySnippet: memorySnippet || null,
    };
  }

  clearChapterTranslations(
    projectId: string,
    chapterId: string,
  ): { deleted: number; keptLocked: number; chapter: EditorChapterResponse } {
    const chapter = this.db.chapters.getById(chapterId);
    if (chapter?.project_id !== projectId) {
      throw new Error('Chapter not found for project');
    }
    const cleared = this.db.translations.clearAiByChapter(
      chapterId,
      resolveActiveEditionId(this.db, projectId),
    );
    return {
      ...cleared,
      chapter: this.getChapter(projectId, chapterId),
    };
  }

  clearChaptersTranslations(
    projectId: string,
    chapterIds: string[],
  ): { deleted: number; keptLocked: number; chapterIds: string[] } {
    let deleted = 0;
    let keptLocked = 0;
    const clearedIds: string[] = [];
    const editionId = resolveActiveEditionId(this.db, projectId);
    for (const chapterId of chapterIds) {
      const chapter = this.db.chapters.getById(chapterId);
      if (chapter?.project_id !== projectId) {
        throw new Error(`Chapter not found for project: ${chapterId}`);
      }
      const result = this.db.translations.clearAiByChapter(chapterId, editionId);
      deleted += result.deleted;
      keptLocked += result.keptLocked;
      clearedIds.push(chapterId);
    }
    return { deleted, keptLocked, chapterIds: clearedIds };
  }

  retranslateChapter(
    projectId: string,
    chapterId: string,
    enqueue: (input: {
      projectId: string;
      chapterFrom: number;
      chapterTo: number;
      sourceParagraphIds: string[];
      batchParagraphs: { paragraphId: string; sourceText: string }[];
    }) => { job: { id: string; state: string } },
  ): {
    deleted: number;
    keptLocked: number;
    job: { id: string; state: string };
    chapter: EditorChapterResponse;
  } {
    const cleared = this.clearChapterTranslations(projectId, chapterId);
    const chapterRow = this.db.chapters.getById(chapterId);
    if (!chapterRow) throw new Error('Chapter not found for project');
    const chapterNumber = chapterRow.chapter_number ?? chapterRow.sequence_order;
    const paragraphs = this.db.paragraphs.listByChapter(chapterId);
    const batchParagraphs = paragraphs.map((p) => ({
      paragraphId: p.paragraph_id,
      sourceText: p.source_text,
    }));
    const { job } = enqueue({
      projectId,
      chapterFrom: chapterNumber,
      chapterTo: chapterNumber,
      sourceParagraphIds: batchParagraphs.map((p) => p.paragraphId),
      batchParagraphs,
    });
    return {
      deleted: cleared.deleted,
      keptLocked: cleared.keptLocked,
      job: { id: job.id, state: job.state },
      chapter: cleared.chapter,
    };
  }

  retranslateChapters(
    projectId: string,
    chapterIds: string[],
    enqueue: (input: {
      projectId: string;
      chapterFrom: number;
      chapterTo: number;
      sourceParagraphIds: string[];
      batchParagraphs: { paragraphId: string; sourceText: string }[];
    }) => { job: { id: string; state: string } },
  ): {
    deleted: number;
    keptLocked: number;
    jobs: { id: string; state: string; chapterId: string }[];
    chapterIds: string[];
  } {
    let deleted = 0;
    let keptLocked = 0;
    const jobs: { id: string; state: string; chapterId: string }[] = [];
    const doneIds: string[] = [];

    for (const chapterId of chapterIds) {
      const chapter = this.db.chapters.getById(chapterId);
      if (chapter?.project_id !== projectId) {
        throw new Error(`Chapter not found for project: ${chapterId}`);
      }
      const cleared = this.db.translations.clearAiByChapter(
      chapterId,
      resolveActiveEditionId(this.db, projectId),
    );
      deleted += cleared.deleted;
      keptLocked += cleared.keptLocked;

      const chapterNumber = chapter.chapter_number ?? chapter.sequence_order;
      const paragraphs = this.db.paragraphs.listByChapter(chapterId);
      if (paragraphs.length === 0) {
        doneIds.push(chapterId);
        continue;
      }
      const batchParagraphs = paragraphs.map((p) => ({
        paragraphId: p.paragraph_id,
        sourceText: p.source_text,
      }));
      const { job } = enqueue({
        projectId,
        chapterFrom: chapterNumber,
        chapterTo: chapterNumber,
        sourceParagraphIds: batchParagraphs.map((p) => p.paragraphId),
        batchParagraphs,
      });
      jobs.push({ id: job.id, state: job.state, chapterId });
      doneIds.push(chapterId);
    }

    return { deleted, keptLocked, jobs, chapterIds: doneIds };
  }

  private loadQaSummary(
    projectId: string,
    chapterNumber: number,
  ): { verdict: string | null; missingParagraphIds: string[] } | null {
    const jobs = this.db.jobs.listByProject(projectId).slice(0, 50);
    for (const job of jobs) {
      const from = job.chapter_from;
      const to = job.chapter_to ?? from;
      if (from == null || chapterNumber < from || (to != null && chapterNumber > to)) {
        continue;
      }
      if (!job.progress) continue;
      try {
        const progress = JSON.parse(job.progress) as {
          qa?: { verdict?: string; missingParagraphIds?: string[] };
        };
        if (progress.qa) {
          return {
            verdict: progress.qa.verdict ?? null,
            missingParagraphIds: progress.qa.missingParagraphIds ?? [],
          };
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

function mapStatus(
  raw: string | undefined,
  warnings: string[],
): EditorParagraphDto['status'] {
  if (warnings.length > 0) return 'qa_warning';
  if (raw === 'reviewed') return 'reviewed';
  if (raw === 'translated') return 'translated';
  if (raw === 'draft') return 'draft';
  return 'pending';
}

const VERSION_SOURCES: TranslationVersionSource[] = [
  'AI_INITIAL',
  'AI_REPAIR',
  'HUMAN_EDIT',
  'SYSTEM_TERM_FIX',
];

function isVersionSource(value: string | undefined | null): value is TranslationVersionSource {
  return value != null && VERSION_SOURCES.includes(value as TranslationVersionSource);
}
