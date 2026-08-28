import type { SourceWorkbookSheet } from '@shared/constants/source-workbook-tabular';
import {
  SOURCE_WORKBOOK_COMMIT_ORDER,
  SOURCE_WORKBOOK_WARNINGS,
} from '@shared/constants/source-workbook-tabular';
import type { TabularCommitContext, TabularRowValidation, TabularUndoEntry } from '../types';
import {
  chapterHasTranslations,
  deriveTranslatedStatus,
  isUuid,
  markChapterNeedsRetranslationIfTranslated,
  pick,
  projectHasLinkedSourceFiles,
  rebuildChapterSourceText,
  resolveChapter,
} from './source-workbook-utils';

export function workbookSheetOrder(): SourceWorkbookSheet[] {
  return [...SOURCE_WORKBOOK_COMMIT_ORDER];
}

export function validateSourceWorkbookRow(
  sheet: SourceWorkbookSheet,
  row: Record<string, string>,
  _rowIndex: number,
  ctx: TabularCommitContext,
): TabularRowValidation {
  switch (sheet) {
    case 'CHAPTERS':
      return validateChapterRow(row, ctx);
    case 'PARAGRAPHS':
      return validateParagraphRow(row, ctx);
    default:
      return { status: 'error', messages: [`Unknown sheet ${sheet}`], normalized: {} };
  }
}

export function commitSourceWorkbookRow(
  sheet: SourceWorkbookSheet,
  row: Record<string, string>,
  ctx: TabularCommitContext,
): { action: 'insert' | 'update' | 'skip'; undo?: TabularUndoEntry } {
  switch (sheet) {
    case 'CHAPTERS':
      return commitChapterRow(row, ctx);
    case 'PARAGRAPHS':
      return commitParagraphRow(row, ctx);
    default:
      throw new Error(`Unknown sheet ${sheet}`);
  }
}

function validateChapterRow(row: Record<string, string>, ctx: TabularCommitContext): TabularRowValidation {
  const messages: string[] = [];
  if (!ctx.projectId) messages.push('projectId required');

  const chapterId = pick(row, 'chapter_id');
  const chapterNumber = pick(row, 'chapter_number');
  if (!chapterId && !chapterNumber) {
    messages.push('chapter_id or chapter_number required');
  }
  if (chapterId && !isUuid(chapterId)) {
    messages.push(`Invalid chapter_id UUID: ${chapterId}`);
  }

  let chapter = null;
  if (ctx.projectId) {
    chapter = resolveChapter(ctx.db, ctx.projectId, chapterId, chapterNumber);
    if ((chapterId || chapterNumber) && !chapter) {
      messages.push(SOURCE_WORKBOOK_WARNINGS.CHAPTER_NOT_FOUND);
    }
  }

  const normalized: Record<string, string> = {
    _sheet: 'CHAPTERS',
    chapter_id: chapter?.id ?? chapterId,
    chapter_number: chapterNumber || (chapter?.chapter_number != null ? String(chapter.chapter_number) : ''),
    chapter_type: pick(row, 'chapter_type') || chapter?.chapter_type || 'NORMAL',
    title: pick(row, 'title') || chapter?.display_title || chapter?.chapter_title || '',
    sequence_order:
      pick(row, 'sequence_order') ||
      (chapter?.sequence_order != null ? String(chapter.sequence_order) : ''),
    source_status: chapter?.source_status ?? pick(row, 'source_status'),
    translated_status: chapter ? deriveTranslatedStatus(ctx.db, chapter.id) : pick(row, 'translated_status'),
  };

  return finalize(messages, normalized);
}

function validateParagraphRow(row: Record<string, string>, ctx: TabularCommitContext): TabularRowValidation {
  const messages: string[] = [];
  if (!ctx.projectId) messages.push('projectId required');

  const mode = ctx.sourceImport?.mode ?? 'METADATA_ONLY';
  const paragraphId = pick(row, 'paragraph_id');
  const chapterId = pick(row, 'chapter_id');
  const sourceText = pick(row, 'source_text');

  if (!paragraphId) {
    messages.push(SOURCE_WORKBOOK_WARNINGS.PARAGRAPH_ID_REQUIRED);
  }

  const para = paragraphId ? ctx.db.paragraphs.getByStableId(paragraphId) : null;
  const resolvedChapter =
    para != null
      ? ctx.db.chapters.getById(para.chapter_id)
      : ctx.projectId
        ? resolveChapter(ctx.db, ctx.projectId, chapterId, '')
        : null;

  if (paragraphId && !para) {
    messages.push(SOURCE_WORKBOOK_WARNINGS.PARAGRAPH_NOT_FOUND);
  }
  if (para && resolvedChapter && resolvedChapter.project_id !== ctx.projectId) {
    messages.push(SOURCE_WORKBOOK_WARNINGS.CHAPTER_NOT_FOUND);
  }

  const linkedSource = ctx.projectId
    ? projectHasLinkedSourceFiles(ctx.db, ctx.projectId)
    : false;

  if (sourceText && para && sourceText !== para.source_text) {
    if (linkedSource && mode !== 'UPDATE_SOURCE_CONTENT') {
      messages.push(SOURCE_WORKBOOK_WARNINGS.SOURCE_OVERWRITE_BLOCKED);
    } else if (mode === 'METADATA_ONLY') {
      messages.push(SOURCE_WORKBOOK_WARNINGS.SOURCE_OVERWRITE_BLOCKED);
    } else {
      messages.push(SOURCE_WORKBOOK_WARNINGS.SOURCE_CHANGED);
      if (
        resolvedChapter &&
        chapterHasTranslations(ctx.db, resolvedChapter.id)
      ) {
        messages.push(SOURCE_WORKBOOK_WARNINGS.NEEDS_RETRANSLATION);
      }
    }
  }

  const normalized: Record<string, string> = {
    _sheet: 'PARAGRAPHS',
    chapter_id: resolvedChapter?.id ?? chapterId,
    paragraph_id: paragraphId,
    sequence: pick(row, 'sequence') || (para ? String(para.sequence) : ''),
    source_text: sourceText,
    paragraph_uuid: para?.id ?? '',
    prior_source_text: para?.source_text ?? '',
  };

  return finalize(messages, normalized);
}

function commitChapterRow(row: Record<string, string>, ctx: TabularCommitContext) {
  const db = ctx.db;
  const projectId = ctx.projectId!;
  const chapter = resolveChapter(db, projectId, row.chapter_id, row.chapter_number);
  if (!chapter) return { action: 'skip' as const };

  const prior = { ...chapter };
  db.chapters.update(chapter.id, {
    chapter_number: row.chapter_number ? Number(row.chapter_number) : chapter.chapter_number,
    chapter_type: (row.chapter_type as typeof chapter.chapter_type) ?? chapter.chapter_type,
    display_title: row.title || chapter.display_title,
    chapter_title: row.title || chapter.chapter_title,
    sequence_order: row.sequence_order ? Number(row.sequence_order) : chapter.sequence_order,
  });

  return {
    action: 'update' as const,
    undo: {
      entityType: 'source_chapter',
      entityId: chapter.id,
      action: 'update' as const,
      prior: { chapter: prior },
    },
  };
}

function commitParagraphRow(row: Record<string, string>, ctx: TabularCommitContext) {
  const mode = ctx.sourceImport?.mode ?? 'METADATA_ONLY';
  if (mode !== 'UPDATE_SOURCE_CONTENT') return { action: 'skip' as const };

  const db = ctx.db;
  const para = db.paragraphs.getByStableId(row.paragraph_id);
  if (!para) return { action: 'skip' as const };

  const prior = { ...para };
  const priorSource = para.source_text;
  const newText = row.source_text;
  if (!newText || newText === priorSource) return { action: 'skip' as const };

  db.paragraphs.update(para.id, newText);
  rebuildChapterSourceText(db, para.chapter_id);
  markChapterNeedsRetranslationIfTranslated(db, para.chapter_id, true);

  return {
    action: 'update' as const,
    undo: {
      entityType: 'source_paragraph',
      entityId: para.id,
      action: 'update' as const,
      prior: { paragraph: prior },
    },
  };
}

function finalize(messages: string[], normalized: Record<string, string>): TabularRowValidation {
  const blocking = messages.filter(
    (m) =>
      m.includes('required') ||
      m.startsWith('Invalid') ||
      m === SOURCE_WORKBOOK_WARNINGS.SOURCE_OVERWRITE_BLOCKED ||
      m === SOURCE_WORKBOOK_WARNINGS.PARAGRAPH_NOT_FOUND ||
      m === SOURCE_WORKBOOK_WARNINGS.CHAPTER_NOT_FOUND ||
      m === SOURCE_WORKBOOK_WARNINGS.PARAGRAPH_ID_REQUIRED,
  );
  const status =
    blocking.length > 0 ? 'error' : messages.length > 0 ? 'warning' : 'valid';
  return { status, messages, normalized };
}
