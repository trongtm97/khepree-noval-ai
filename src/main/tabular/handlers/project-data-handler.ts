import {
  PROJECT_DATA_TABULAR_COLUMNS,
  PROJECT_DATA_WORKBOOK_SHEETS,
} from '@shared/constants/project-data-tabular';
import type { TabularDataTypeHandler } from '../types';
import { pick } from './character-tabular-utils';
import {
  commitProjectDataRow,
  validateProjectDataRow,
} from './project-data-workbook-handler';
import type { ProjectDataWorkbookSheet } from '@shared/constants/project-data-tabular';

export const projectDataTabularHandler: TabularDataTypeHandler = {
  dataType: 'project_data',
  sheetName: 'PROJECT',
  columns: PROJECT_DATA_TABULAR_COLUMNS.map((key) => ({
    key,
    header: key,
    required: key === 'project_id',
  })),

  detectFromHeaders(headers) {
    const set = new Set(headers.map((h) => h.toLowerCase()));
    return set.has('project_id') && (set.has('source_title') || set.has('official_summary'));
  },

  validateRow(row, rowIndex, ctx) {
    const sheet = (row._sheet as ProjectDataWorkbookSheet | undefined) ?? 'PROJECT';
    return validateProjectDataRow(sheet, row, rowIndex, ctx);
  },

  naturalKey(row, ctx) {
    const sheet = row._sheet || 'PROJECT';
    const id =
      pick(row, 'rule_id', 'fact_id', 'memory_id', 'project_id') ||
      pick(row, 'source_key', 'key') ||
      pick(row, 'rule_text');
    return `${sheet}|${ctx.projectId ?? ''}|${id}`;
  },

  exportRows(ctx) {
    if (!ctx.projectId) return [];
    return [
      {
        project_id: ctx.projectId,
        source_title: '',
        edition_title: '',
        source_language: '',
        target_language: '',
        author: '',
        genre: '',
        status: '',
        description: '',
        official_summary: '',
      },
    ];
  },

  commitRow(row, ctx) {
    const sheet = (row._sheet as ProjectDataWorkbookSheet | undefined) ?? 'PROJECT';
    return commitProjectDataRow(sheet, row, ctx);
  },
};

export { PROJECT_DATA_WORKBOOK_SHEETS };
