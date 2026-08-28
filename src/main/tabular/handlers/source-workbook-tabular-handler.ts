import {
  CHAPTERS_TABULAR_COLUMNS,
  PARAGRAPHS_TABULAR_COLUMNS,
} from '@shared/constants/source-workbook-tabular';
import type { SourceWorkbookSheet } from '@shared/constants/source-workbook-tabular';
import type { TabularDataTypeHandler } from '../types';
import { pick } from './character-tabular-utils';
import { buildSourceWorkbookExportData } from '../source-workbook-export';
import {
  commitSourceWorkbookRow,
  validateSourceWorkbookRow,
} from './source-workbook-handler';

export const sourceWorkbookTabularHandler: TabularDataTypeHandler = {
  dataType: 'source_workbook',
  sheetName: 'PARAGRAPHS',
  columns: PARAGRAPHS_TABULAR_COLUMNS.map((key) => ({
    key,
    header: key,
    required: key === 'paragraph_id',
  })),

  detectFromHeaders(headers) {
    const set = new Set(headers.map((h) => h.toLowerCase()));
    return (
      (set.has('chapter_id') && set.has('chapter_number')) ||
      (set.has('paragraph_id') && set.has('source_text'))
    );
  },

  validateRow(row, rowIndex, ctx) {
    const sheet: SourceWorkbookSheet = pick(row, 'paragraph_id') ? 'PARAGRAPHS' : 'CHAPTERS';
    return validateSourceWorkbookRow(sheet, row, rowIndex, ctx);
  },

  naturalKey(row, ctx) {
    const sheet = pick(row, 'paragraph_id') ? 'PARAGRAPHS' : 'CHAPTERS';
    const id = pick(row, 'paragraph_id', 'chapter_id') || pick(row, 'chapter_number');
    return `${sheet}|${ctx.projectId ?? ''}|${id}`;
  },

  exportRows(ctx) {
    if (!ctx.projectId) return [];
    return buildSourceWorkbookExportData(ctx.db, ctx.projectId).paragraphs;
  },

  commitRow(row, ctx) {
    const sheet: SourceWorkbookSheet = pick(row, 'paragraph_id') ? 'PARAGRAPHS' : 'CHAPTERS';
    return commitSourceWorkbookRow(sheet, row, ctx);
  },
};

export { CHAPTERS_TABULAR_COLUMNS, PARAGRAPHS_TABULAR_COLUMNS };
