import {
  TRANSLATION_SPREADSHEET_COLUMNS,
  TRANSLATION_SPREADSHEET_SHEET,
  TRANSLATION_SPREADSHEET_WARNINGS,
} from '@shared/constants/translation-spreadsheet';
import type { TabularDataTypeHandler } from '../types';

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v?.trim()) return v.trim();
  }
  return '';
}

function parseBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function parseIsoTime(value: string | null | undefined): number {
  if (!value?.trim()) return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

export function detectTranslationConflict(
  fileUpdatedAt: string,
  dbUpdatedAt: string | null,
  fileTranslated: string,
  dbTranslated: string | null,
): boolean {
  const fileMs = parseIsoTime(fileUpdatedAt);
  const dbMs = parseIsoTime(dbUpdatedAt);
  if (!fileMs || !dbMs) return false;
  if (dbMs <= fileMs) return false;
  const norm = (s: string | null) => (s ?? '').trim();
  return norm(fileTranslated) !== norm(dbTranslated);
}

export const translationsTabularHandler: TabularDataTypeHandler = {
  dataType: 'translations',
  sheetName: TRANSLATION_SPREADSHEET_SHEET,
  columns: TRANSLATION_SPREADSHEET_COLUMNS.map((key) => ({
    key,
    header: key,
    required: key === 'paragraph_id',
  })),

  detectFromHeaders(headers) {
    const set = new Set(headers);
    return set.has('paragraph_id') && set.has('translated_text');
  },

  validateRow(row, _rowIndex, ctx) {
    const messages: string[] = [];
    const stableParagraphId = pick(row, 'paragraph_id');
    if (!stableParagraphId) {
      return { status: 'error', messages: ['paragraph_id is required'], normalized: {} };
    }

    const projectId = pick(row, 'project_id') || ctx.projectId || '';
    const editionId = pick(row, 'edition_id') || ctx.editionId || '';
    if (!projectId || !editionId) {
      messages.push('project_id and edition_id required');
    }
    if (ctx.projectId && projectId && projectId !== ctx.projectId) {
      messages.push('project_id mismatch');
    }
    if (ctx.editionId && editionId && editionId !== ctx.editionId) {
      messages.push('edition_id mismatch');
    }

    const db = ctx.db;
    const para = db.paragraphs.getByStableId(stableParagraphId);
    if (!para) {
      return {
        status: 'error',
        messages: [`paragraph_id not found: ${stableParagraphId}`],
        normalized: {},
      };
    }

    const chapter = db.chapters.getById(para.chapter_id);
    if (!chapter || (ctx.projectId && chapter.project_id !== ctx.projectId)) {
      messages.push('paragraph does not belong to project');
    }

    const fileSource = pick(row, 'source_text');
    if (fileSource && fileSource !== para.source_text) {
      messages.push(TRANSLATION_SPREADSHEET_WARNINGS.SOURCE_CHANGED);
    }

    const translation = editionId
      ? db.translations.getByParagraphId(para.id, editionId)
      : null;
    const fileTranslated = pick(row, 'translated_text');
    const fileUpdatedAt = pick(row, 'updated_at');

    if (
      translation &&
      detectTranslationConflict(
        fileUpdatedAt,
        translation.updated_at,
        fileTranslated,
        translation.translated_text,
      )
    ) {
      messages.push(TRANSLATION_SPREADSHEET_WARNINGS.CONFLICT_APP_NEWER);
    }

    const normalized: Record<string, string> = {
      project_id: projectId,
      edition_id: editionId,
      chapter_number: String(chapter?.chapter_number ?? pick(row, 'chapter_number')),
      chapter_title: pick(row, 'chapter_title') || chapter?.chapter_title || chapter?.display_title || '',
      paragraph_id: stableParagraphId,
      paragraph_uuid: para.id,
      source_text: para.source_text,
      translated_text: fileTranslated,
      translation_status:
        pick(row, 'translation_status', 'status') || translation?.status || 'translated',
      human_locked: parseBool(pick(row, 'human_locked')) ? '1' : '0',
      qa_status: pick(row, 'qa_status'),
      notes: pick(row, 'notes'),
      updated_at: fileUpdatedAt,
      translation_id: translation?.id ?? '',
      db_translated_text: translation?.translated_text ?? '',
      db_updated_at: translation?.updated_at ?? '',
    };

    const status =
      messages.some(
        (m) => m.includes('not found') || m.includes('mismatch') || m.includes('required'),
      )
        ? 'error'
        : messages.length > 0
          ? 'warning'
          : 'valid';
    return { status, messages, normalized };
  },

  naturalKey(row, ctx) {
    const editionId = pick(row, 'edition_id') || ctx.editionId || '';
    const paragraphId = pick(row, 'paragraph_id');
    return `${editionId}|${paragraphId}`;
  },

  exportRows(ctx) {
    if (!ctx.projectId || !ctx.editionId) return [];
    const db = ctx.db;
    return db.translations.listSpreadsheetRows(ctx.projectId, ctx.editionId).map((r) => ({
      project_id: r.project_id,
      edition_id: r.edition_id,
      chapter_number: r.chapter_number != null ? String(r.chapter_number) : '',
      chapter_title: r.chapter_title ?? '',
      paragraph_id: r.paragraph_id,
      source_text: r.source_text,
      translated_text: r.translated_text ?? '',
      translation_status: r.translation_status ?? 'pending',
      human_locked: r.human_locked === 1 ? '1' : '0',
      qa_status: '',
      notes: r.editor_note ?? '',
      updated_at: r.updated_at ?? '',
    }));
  },

  commitRow(row, ctx) {
    const db = ctx.db;
    const strategy = ctx.translationImport?.conflictStrategy ?? 'USE_EXCEL';
    const stableId = row.paragraph_id;
    const editionId = row.edition_id || ctx.editionId;
    const para = db.paragraphs.getByStableId(stableId);
    if (!para) throw new Error(`paragraph_id not found: ${stableId}`);

    const existing = editionId
      ? db.translations.getByParagraphId(para.id, editionId)
      : null;

    const hasConflict = detectTranslationConflict(
      row.updated_at,
      existing?.updated_at ?? null,
      row.translated_text,
      existing?.translated_text ?? null,
    );

    if (hasConflict && strategy === 'KEEP_APP') {
      return { action: 'skip' as const };
    }

    const newText = row.translated_text;
    const prior = existing ? { ...existing } : null;
    const status = row.translation_status || 'reviewed';
    const humanLocked = row.human_locked === '1';
    const notes = row.notes || 'Spreadsheet import';

    if (!existing) {
      if (!newText.trim()) return { action: 'skip' as const };
      const created = db.translations.create({
        paragraph_id: para.id,
        edition_id: editionId ?? null,
        translated_text: newText,
        status,
        version_source: 'HUMAN_EDIT',
        human_locked: humanLocked,
      });
      return {
        action: 'insert' as const,
        undo: {
          entityType: 'translation',
          entityId: created.id,
          action: 'insert',
          prior: null,
        },
      };
    }

    const sameText = (existing.translated_text ?? '').trim() === newText.trim();
    const sameLock = existing.human_locked === (humanLocked ? 1 : 0);
    const sameStatus = existing.status === status;
    if (sameText && sameLock && sameStatus && !row.notes) {
      return { action: 'skip' as const };
    }

    const updated = db.translations.appendVersion(existing.id, {
      translated_text: newText,
      status,
      version_source: 'HUMAN_EDIT',
      human_locked: humanLocked,
      editor_note: notes,
    });
    if (!updated) return { action: 'skip' as const };

    return {
      action: 'update' as const,
      undo: {
        entityType: 'translation',
        entityId: existing.id,
        action: 'update',
        prior: prior as Record<string, unknown>,
      },
    };
  },
};
