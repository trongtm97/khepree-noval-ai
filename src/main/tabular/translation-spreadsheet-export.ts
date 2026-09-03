import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { APP_NAME } from '@shared/constants/app';
import { TABULAR_META_SHEET } from '@shared/constants/tabular';
import { TRANSLATION_SPREADSHEET_SHEET } from '@shared/constants/translation-spreadsheet';
import type { TabularMeta } from '@shared/schemas/tabular';
import type { DatabaseManager } from '../db/database-manager';
import { buildMetaSheetRows, cellToString } from './tabular-file-parser';

const COLUMN_WIDTHS: Record<string, number> = {
  project_id: 36,
  edition_id: 36,
  chapter_number: 14,
  chapter_title: 28,
  paragraph_id: 22,
  source_text: 48,
  translated_text: 48,
  translation_status: 16,
  human_locked: 12,
  qa_status: 14,
  notes: 32,
  updated_at: 22,
};

export async function writeTranslationSpreadsheetWorkbook(input: {
  outputPath: string;
  meta: TabularMeta;
  headers: string[];
  rows: Record<string, string>[];
  db: DatabaseManager;
  projectId: string;
  editionId: string;
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();

  const metaSheet = workbook.addWorksheet(TABULAR_META_SHEET);
  for (const [key, value] of buildMetaSheetRows(input.meta)) {
    metaSheet.addRow([key, value]);
  }

  const sheet = workbook.addWorksheet(TRANSLATION_SPREADSHEET_SHEET);
  sheet.addRow(input.headers);
  for (const row of input.rows) {
    sheet.addRow(input.headers.map((h) => row[h] ?? ''));
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, input.rows.length + 1), column: input.headers.length },
  };

  input.headers.forEach((header, idx) => {
    const col = sheet.getColumn(idx + 1);
    col.width = COLUMN_WIDTHS[header] ?? 18;
    if (header === 'source_text' || header === 'translated_text' || header === 'notes') {
      col.alignment = { wrapText: true, vertical: 'top' };
    }
  });

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.font = { bold: true };
      return;
    }
    row.eachCell((cell) => {
      cell.value = cellToString(cell);
    });
  });

  writeQaIssuesSheet(workbook, input.db, input.projectId);
  writeTermsReferenceSheet(workbook, input.db, input.projectId, input.editionId);

  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  await workbook.xlsx.writeFile(input.outputPath);
}

function writeQaIssuesSheet(
  workbook: ExcelJS.Workbook,
  db: DatabaseManager,
  projectId: string,
): void {
  const sheet = workbook.addWorksheet('QA_ISSUES');
  sheet.addRow(['chapter_number', 'paragraph_id', 'issue']);
  const jobs = db.jobs.listByProject(projectId).slice(0, 100);
  for (const job of jobs) {
    if (!job.progress) continue;
    try {
      const progress = JSON.parse(job.progress) as {
        qa?: { verdict?: string; missingParagraphIds?: string[] };
      };
      const missing = progress.qa?.missingParagraphIds ?? [];
      for (const pid of missing) {
        sheet.addRow([job.chapter_from ?? '', pid, progress.qa?.verdict ?? 'missing']);
      }
    } catch {
      /* ignore */
    }
  }
}

function writeTermsReferenceSheet(
  workbook: ExcelJS.Workbook,
  db: DatabaseManager,
  projectId: string,
  editionId: string,
): void {
  const sheet = workbook.addWorksheet('TERMS_REFERENCE');
  sheet.addRow(['source_text', 'target_text', 'term_type', 'scope']);
  const edition = db.translationEditions.getById(editionId);
  const project = db.projects.getById(projectId);
  const terms = db.terms.listForMatching({
    projectId,
    sourceLanguage: project?.source_language,
    targetLanguage: edition?.target_language ?? project?.target_language,
  });
  for (const term of terms.slice(0, 5000)) {
    const translations = db.terms.listTranslations(term.id);
    const primary = translations.find((t) => t.is_primary === 1)?.target_text
      ?? translations[0].target_text;
    sheet.addRow([
      term.source_text ?? term.source_simplified,
      primary,
      term.term_type,
      term.scope,
    ]);
  }
}
