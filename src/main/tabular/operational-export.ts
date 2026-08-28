import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { TABULAR_META_SHEET } from '@shared/constants/tabular';
import {
  ACTIVITY_LOG_EXPORT_COLUMNS,
  JOBS_EXPORT_COLUMNS,
  LEARNING_CONFLICTS_EXPORT_COLUMNS,
  QA_EXPORT_COLUMNS,
} from '@shared/constants/operational-tabular';
import type { TabularMeta } from '@shared/schemas/tabular';
import { buildMetaSheetRows, cellToString } from './tabular-file-parser';

export interface OperationalWorkbookData {
  jobs: Record<string, string>[];
  qa: Record<string, string>[];
  activityLog: Record<string, string>[];
  learningConflicts: Record<string, string>[];
}

export async function writeOperationalWorkbookXlsx(input: {
  outputPath: string;
  meta: TabularMeta;
  data: OperationalWorkbookData;
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NovelTrans Studio';
  workbook.created = new Date();

  const metaSheet = workbook.addWorksheet(TABULAR_META_SHEET);
  for (const [key, value] of buildMetaSheetRows(input.meta)) {
    metaSheet.addRow([key, value]);
  }

  const sheets = [
    { name: 'JOBS', headers: JOBS_EXPORT_COLUMNS, rows: input.data.jobs },
    { name: 'QA', headers: QA_EXPORT_COLUMNS, rows: input.data.qa },
    { name: 'ACTIVITY_LOG', headers: ACTIVITY_LOG_EXPORT_COLUMNS, rows: input.data.activityLog },
    {
      name: 'LEARNING_CONFLICTS',
      headers: LEARNING_CONFLICTS_EXPORT_COLUMNS,
      rows: input.data.learningConflicts,
    },
  ];

  for (const def of sheets) {
    const sheet = workbook.addWorksheet(def.name);
    sheet.addRow([...def.headers]);
    for (const row of def.rows) {
      sheet.addRow(def.headers.map((h) => row[h] ?? ''));
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, def.rows.length + 1), column: def.headers.length },
    };
    sheet.getRow(1).font = { bold: true };
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        cell.value = cellToString(cell);
      });
    });
  }

  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  await workbook.xlsx.writeFile(input.outputPath);
}
