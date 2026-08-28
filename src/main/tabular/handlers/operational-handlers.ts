import type { TabularDataType } from '@shared/constants/tabular';
import {
  ACTIVITY_LOG_EXPORT_COLUMNS,
  JOBS_EXPORT_COLUMNS,
  LEARNING_CONFLICTS_EXPORT_COLUMNS,
  QA_EXPORT_COLUMNS,
} from '@shared/constants/operational-tabular';
import type { TabularDataTypeHandler } from '../types';
import {
  buildActivityLogExportRows,
  buildJobsExportRows,
  buildLearningConflictsExportRows,
  buildQaExportRows,
} from '../operational-export-builders';

function exportOnlyHandler(input: {
  dataType: TabularDataType;
  sheetName: string;
  columns: readonly string[];
  exportRows: TabularDataTypeHandler['exportRows'];
}): TabularDataTypeHandler {
  return {
    dataType: input.dataType,
    sheetName: input.sheetName,
    columns: input.columns.map((key) => ({ key, header: key })),
    detectFromHeaders: () => false,
    validateRow: () => {
      throw new Error('Import not supported for operational exports');
    },
    naturalKey: () => '',
    exportRows: input.exportRows,
    commitRow: () => {
      throw new Error('Import not supported for operational exports');
    },
  };
}

export const operationalJobsHandler = exportOnlyHandler({
  dataType: 'operational_jobs',
  sheetName: 'JOBS',
  columns: JOBS_EXPORT_COLUMNS,
  exportRows: (ctx) =>
    buildJobsExportRows({
      db: ctx.db,
      projectId: ctx.projectId,
      sanitize: ctx.operationalExport?.sanitize,
      limit: ctx.operationalExport?.limit,
    }),
});

export const operationalQaHandler = exportOnlyHandler({
  dataType: 'operational_qa',
  sheetName: 'QA',
  columns: QA_EXPORT_COLUMNS,
  exportRows: (ctx) =>
    buildQaExportRows({
      db: ctx.db,
      projectId: ctx.projectId,
      sanitize: ctx.operationalExport?.sanitize,
      limit: ctx.operationalExport?.limit,
    }),
});

export const operationalActivityHandler = exportOnlyHandler({
  dataType: 'operational_activity',
  sheetName: 'ACTIVITY_LOG',
  columns: ACTIVITY_LOG_EXPORT_COLUMNS,
  exportRows: (ctx) =>
    buildActivityLogExportRows({
      db: ctx.db,
      projectId: ctx.projectId,
      sanitize: ctx.operationalExport?.sanitize,
      limit: ctx.operationalExport?.limit,
    }),
});

export const operationalConflictsHandler = exportOnlyHandler({
  dataType: 'operational_conflicts',
  sheetName: 'LEARNING_CONFLICTS',
  columns: LEARNING_CONFLICTS_EXPORT_COLUMNS,
  exportRows: (ctx) =>
    buildLearningConflictsExportRows({
      db: ctx.db,
      projectId: ctx.projectId,
      sanitize: ctx.operationalExport?.sanitize,
      limit: ctx.operationalExport?.limit,
    }),
});

export const operationalWorkbookHandler = exportOnlyHandler({
  dataType: 'operational_workbook',
  sheetName: 'JOBS',
  columns: JOBS_EXPORT_COLUMNS,
  exportRows: (ctx) =>
    buildJobsExportRows({
      db: ctx.db,
      projectId: ctx.projectId,
      sanitize: ctx.operationalExport?.sanitize,
      limit: ctx.operationalExport?.limit,
    }),
});
