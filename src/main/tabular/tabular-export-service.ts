import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  NTS_TABULAR_FORMAT,
  TABULAR_CSV_UTF8_BOM_DEFAULT,
  TABULAR_META_SHEET,
  TABULAR_SCHEMA_VERSION,
  type TabularDataType,
  type TabularFormat,
} from '@shared/constants/tabular';
import type { TermTabularExportScope } from '@shared/constants/term-tabular';
import type { TabularExportResponse, TabularMeta } from '@shared/schemas/tabular';
import { APP_NAME } from '@shared/constants/app';
import { getDatabase } from '../db/connection';
import { tabularSchemaRegistry } from './tabular-schema-registry';
import { buildMetaSheetRows, cellToString } from './tabular-file-parser';
import { serializeCsvRow } from './csv-utils';
import { writeTranslationSpreadsheetWorkbook } from './translation-spreadsheet-export';
import {
  buildCharacterWorkbookExportData,
  writeCharacterWorkbookXlsx,
} from './character-workbook-export';
import {
  buildProjectDataWorkbookExportData,
  writeProjectDataWorkbookXlsx,
} from './project-data-workbook-export';
import {
  buildSourceWorkbookExportData,
  writeSourceWorkbookXlsx,
} from './source-workbook-export';
import {
  buildOperationalWorkbookData,
} from './operational-export-builders';
import { writeOperationalWorkbookXlsx } from './operational-export';

export class TabularExportService {
  async export(input: {
    dataType: TabularDataType;
    format: TabularFormat;
    outputPath: string;
    projectId?: string;
    editionId?: string;
    utf8Bom?: boolean;
    exportScope?: TermTabularExportScope;
    operationalOptions?: { sanitizeEmail?: boolean; limit?: number };
  }): Promise<TabularExportResponse> {
    const db = getDatabase();
    const handler = tabularSchemaRegistry.getHandler(input.dataType);

    let sourceLanguage: string | undefined;
    let targetLanguage: string | undefined;
    if (input.projectId) {
      const project = db.projects.getById(input.projectId);
      sourceLanguage = project?.source_language;
      targetLanguage = project?.target_language;
    }
    if (input.editionId) {
      const edition = db.translationEditions.getById(input.editionId);
      targetLanguage = edition?.target_language ?? targetLanguage;
    }

    const meta: TabularMeta = {
      khepree_format: NTS_TABULAR_FORMAT,
      schema_version: TABULAR_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      data_type: input.dataType,
      project_id: input.projectId,
      edition_id: input.editionId,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    };

    const rows = handler.exportRows({
      db,
      projectId: input.projectId,
      editionId: input.editionId,
      meta,
      termExport: input.exportScope ? { exportScope: input.exportScope } : undefined,
      operationalExport: {
        sanitize: { sanitizeEmail: input.operationalOptions?.sanitizeEmail ?? true },
        limit: input.operationalOptions?.limit,
      },
    });

    let rowCount = rows.length;
    if (input.dataType === 'operational_workbook' && input.format === 'csv') {
      throw new Error('Operational workbook export requires XLSX format');
    }
    if (input.format === 'csv') {
      await this.writeCsv(input.outputPath, handler.columns.map((c) => c.header), rows, {
        meta,
        utf8Bom: input.utf8Bom ?? TABULAR_CSV_UTF8_BOM_DEFAULT,
      });
    } else if (input.dataType === 'translations' && input.projectId && input.editionId) {
      await writeTranslationSpreadsheetWorkbook({
        outputPath: input.outputPath,
        meta,
        headers: handler.columns.map((c) => c.header),
        rows,
        db,
        projectId: input.projectId,
        editionId: input.editionId,
      });
    } else if (input.dataType === 'characters' && input.projectId && input.editionId) {
      const workbookData = buildCharacterWorkbookExportData(db, input.projectId, input.editionId);
      rowCount = workbookData.characters.length;
      await writeCharacterWorkbookXlsx({
        outputPath: input.outputPath,
        meta: { ...meta, schema_version: 2 },
        data: workbookData,
      });
    } else if (input.dataType === 'project_data' && input.projectId) {
      const workbookData = buildProjectDataWorkbookExportData(
        db,
        input.projectId,
        input.editionId,
      );
      rowCount =
        workbookData.project.length +
        workbookData.rules.length +
        workbookData.worldKnowledge.length +
        workbookData.storyFacts.length;
      await writeProjectDataWorkbookXlsx({
        outputPath: input.outputPath,
        meta: { ...meta, schema_version: 2 },
        data: workbookData,
      });
    } else if (input.dataType === 'source_workbook' && input.projectId) {
      const workbookData = buildSourceWorkbookExportData(db, input.projectId);
      rowCount = workbookData.chapters.length + workbookData.paragraphs.length;
      await writeSourceWorkbookXlsx({
        outputPath: input.outputPath,
        meta: { ...meta, schema_version: 2 },
        data: workbookData,
      });
    } else if (input.dataType === 'operational_workbook') {
      const workbookData = buildOperationalWorkbookData({
        db,
        projectId: input.projectId,
        sanitize: { sanitizeEmail: input.operationalOptions?.sanitizeEmail ?? true },
        limit: input.operationalOptions?.limit,
      });
      rowCount =
        workbookData.jobs.length +
        workbookData.qa.length +
        workbookData.activityLog.length +
        workbookData.learningConflicts.length;
      await writeOperationalWorkbookXlsx({
        outputPath: input.outputPath,
        meta: { ...meta, schema_version: 2 },
        data: workbookData,
      });
    } else {
      await this.writeXlsx(input.outputPath, handler.sheetName, handler.columns.map((c) => c.header), rows, meta);
    }

    if (input.format === 'csv') {
      fs.writeFileSync(`${input.outputPath}.meta.json`, JSON.stringify(meta, null, 2), 'utf8');
    }

    return {
      filePath: input.outputPath,
      format: input.format,
      rowCount,
    };
  }

  private async writeCsv(
    filePath: string,
    headers: string[],
    rows: Record<string, string>[],
    options: { meta: TabularMeta; utf8Bom: boolean },
  ): Promise<void> {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(options.meta)) {
      if (v != null && v !== '') lines.push(`# ${k}: ${v}`);
    }
    lines.push(serializeCsvRow(headers));
    for (const row of rows) {
      lines.push(serializeCsvRow(headers.map((h) => row[h] ?? '')));
    }
    const body = lines.join('\r\n');
    const payload = options.utf8Bom ? `\uFEFF${body}` : body;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, payload, 'utf8');
  }

  private async writeXlsx(
    filePath: string,
    sheetName: string,
    headers: string[],
    rows: Record<string, string>[],
    meta: TabularMeta,
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = APP_NAME;
    workbook.created = new Date();

    const metaSheet = workbook.addWorksheet(TABULAR_META_SHEET);
    for (const [key, value] of buildMetaSheetRows(meta)) {
      metaSheet.addRow([key, value]);
    }

    const dataSheet = workbook.addWorksheet(sheetName);
    dataSheet.addRow(headers);
    for (const row of rows) {
      dataSheet.addRow(headers.map((h) => row[h] ?? ''));
    }

    // Force values only — no formulas on export.
    dataSheet.eachRow((row) => {
      row.eachCell((cell) => {
        const text = cellToString(cell);
        cell.value = text;
      });
    });

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await workbook.xlsx.writeFile(filePath);
  }
}

export const tabularExportService = new TabularExportService();
