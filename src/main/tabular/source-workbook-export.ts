import ExcelJS from 'exceljs';
import { APP_NAME } from '@shared/constants/app';
import fs from 'node:fs';
import path from 'node:path';
import { TABULAR_META_SHEET } from '@shared/constants/tabular';
import {
  CHAPTERS_TABULAR_COLUMNS,
  PARAGRAPHS_TABULAR_COLUMNS,
  SOURCE_WORKBOOK_SHEETS,
} from '@shared/constants/source-workbook-tabular';
import type { TabularMeta } from '@shared/schemas/tabular';
import type { DatabaseManager } from '../db/database-manager';
import { buildMetaSheetRows, cellToString } from './tabular-file-parser';
import { deriveTranslatedStatus } from './handlers/source-workbook-utils';

export interface SourceWorkbookExportData {
  chapters: Record<string, string>[];
  paragraphs: Record<string, string>[];
}

export function buildSourceWorkbookExportData(
  db: DatabaseManager,
  projectId: string,
): SourceWorkbookExportData {
  const chapters = db.chapters.listByProject(projectId).map((ch) => ({
    chapter_id: ch.id,
    chapter_number: ch.chapter_number != null ? String(ch.chapter_number) : '',
    chapter_type: ch.chapter_type,
    title: ch.display_title ?? ch.chapter_title ?? '',
    sequence_order: String(ch.sequence_order),
    source_status: ch.source_status,
    translated_status: deriveTranslatedStatus(db, ch.id),
  }));

  const paragraphs: Record<string, string>[] = [];
  for (const ch of db.chapters.listByProject(projectId)) {
    for (const p of db.paragraphs.listByChapter(ch.id)) {
      paragraphs.push({
        chapter_id: ch.id,
        paragraph_id: p.paragraph_id,
        sequence: String(p.sequence),
        source_text: p.source_text,
      });
    }
  }

  return { chapters, paragraphs };
}

export async function writeSourceWorkbookXlsx(input: {
  outputPath: string;
  meta: TabularMeta;
  data: SourceWorkbookExportData;
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();

  const metaSheet = workbook.addWorksheet(TABULAR_META_SHEET);
  for (const [key, value] of buildMetaSheetRows(input.meta)) {
    metaSheet.addRow([key, value]);
  }

  const defs = [
    { name: 'CHAPTERS', headers: CHAPTERS_TABULAR_COLUMNS, rows: input.data.chapters },
    { name: 'PARAGRAPHS', headers: PARAGRAPHS_TABULAR_COLUMNS, rows: input.data.paragraphs },
  ];

  for (const def of defs) {
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
    if (def.name === 'PARAGRAPHS') {
      const sourceCol = (def.headers as readonly string[]).indexOf('source_text') + 1;
      if (sourceCol > 0) {
        sheet.getColumn(sourceCol).alignment = { wrapText: true, vertical: 'top' };
        sheet.getColumn(sourceCol).width = 48;
      }
    }
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

export function isSourceWorkbookFile(
  sheets: Map<string, { headers: string[]; rows: Record<string, string>[] }>,
): boolean {
  for (const name of SOURCE_WORKBOOK_SHEETS) {
    const sheet = sheets.get(name);
    if (sheet && sheet.rows.length > 0) return true;
  }
  const chapters = sheets.get('CHAPTERS');
  if (chapters?.headers.includes('chapter_id')) return true;
  const paragraphs = sheets.get('PARAGRAPHS');
  if (paragraphs?.headers.includes('paragraph_id')) return true;
  return false;
}
