import { dialog } from 'electron';
import type { TabularDataType, TabularFormat, TabularImportMode } from '@shared/constants/tabular';
import type { TranslationSpreadsheetConflictStrategy } from '@shared/constants/translation-spreadsheet';
import type { SourceWorkbookImportMode } from '@shared/constants/source-workbook-tabular';
import type {
  TermTabularDefaultStatus,
  TermTabularDuplicateStrategy,
  TermTabularExportScope,
} from '@shared/constants/term-tabular';
import type {
  TabularCommitResponse,
  TabularExportResponse,
  TabularPreviewResponse,
  TabularSelectFileResponse,
} from '@shared/schemas/tabular';
import { detectFormat } from './tabular-file-parser';
import { importPreviewService } from './import-preview-service';
import { importCommitService } from './import-commit-service';
import { tabularExportService } from './tabular-export-service';
import { writeTermVaultTemplate } from './term-template-service';
import { getDatabase } from '../db/connection';

export class TabularImportService {
  async selectImportFile(input: {
    dataType: TabularDataType;
    format?: 'csv' | 'xlsx' | 'any';
  }): Promise<TabularSelectFileResponse> {
    const format = input.format ?? 'any';
    const extensions =
      format === 'any'
        ? ['csv', 'xlsx']
        : format === 'csv'
          ? ['csv']
          : ['xlsx'];

    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Tabular data', extensions }],
    });

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, filePath: null, detectedFormat: null };
    }

    const filePath = result.filePaths[0];
    return {
      canceled: false,
      filePath,
      detectedFormat: detectFormat(filePath),
    };
  }

  preview(input: {
    filePath: string;
    projectId?: string;
    editionId?: string;
    dataTypeHint?: TabularDataType;
    duplicateStrategy?: TermTabularDuplicateStrategy;
    defaultImportStatus?: TermTabularDefaultStatus;
    allowElevatedStatus?: boolean;
    conflictStrategy?: TranslationSpreadsheetConflictStrategy;
    sourceImportMode?: SourceWorkbookImportMode;
    columnMapping?: Record<string, string>;
  }): Promise<TabularPreviewResponse> {
    return importPreviewService.preview(input);
  }

  commit(input: {
    previewId: string;
    mode?: TabularImportMode;
    projectId?: string;
    editionId?: string;
    duplicateStrategy?: TermTabularDuplicateStrategy;
    defaultImportStatus?: TermTabularDefaultStatus;
    allowElevatedStatus?: boolean;
    conflictStrategy?: TranslationSpreadsheetConflictStrategy;
    sourceImportMode?: SourceWorkbookImportMode;
  }): TabularCommitResponse {
    return importCommitService.commit({
      ...input,
      mode: input.mode ?? 'IMPORT_VALID_ONLY',
    });
  }

  discardPreview(previewId: string): void {
    importPreviewService.discard(previewId);
  }

  async selectExportPath(input: {
    dataType: TabularDataType;
    format: TabularFormat;
    defaultName: string;
  }): Promise<{ canceled: boolean; filePath: string | null }> {
    const ext = input.format === 'csv' ? 'csv' : 'xlsx';
    const result = await dialog.showSaveDialog({
      defaultPath: input.defaultName.endsWith(`.${ext}`)
        ? input.defaultName
        : `${input.defaultName}.${ext}`,
      filters: [{ name: input.format.toUpperCase(), extensions: [ext] }],
    });
    return {
      canceled: result.canceled,
      filePath: result.filePath ?? null,
    };
  }

  export(input: {
    dataType: TabularDataType;
    format: TabularFormat;
    outputPath: string;
    projectId?: string;
    editionId?: string;
    utf8Bom?: boolean;
    exportScope?: TermTabularExportScope;
    operationalOptions?: { sanitizeEmail?: boolean; limit?: number };
  }): Promise<TabularExportResponse> {
    return tabularExportService.export(input);
  }

  async downloadTermTemplate(outputPath?: string): Promise<{ filePath: string }> {
    let target = outputPath;
    if (!target) {
      const result = await dialog.showSaveDialog({
        defaultPath: 'khepree-novel-ai-terms-template.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (result.canceled || !result.filePath) {
        throw new Error('Template download canceled');
      }
      target = result.filePath;
    }
    const filePath = await writeTermVaultTemplate(target);
    return { filePath };
  }

  undoLast(projectId?: string) {
    return importCommitService.undoLast(projectId);
  }

  listHistory(projectId?: string) {
    const db = getDatabase();
    return db.importHistory.listRecent(projectId).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      editionId: row.edition_id,
      dataType: row.data_type,
      fileName: row.file_name,
      fileFormat: row.file_format,
      rowCount: row.row_count,
      insertedCount: row.inserted_count,
      updatedCount: row.updated_count,
      skippedCount: row.skipped_count,
      errorCount: row.error_count,
      status: row.status,
      createdAt: row.created_at,
    }));
  }
}

export const tabularImportService = new TabularImportService();
