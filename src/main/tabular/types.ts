import type { TabularDataType, TabularRowStatus } from '@shared/constants/tabular';
import type {
  TermTabularDefaultStatus,
  TermTabularDuplicateStrategy,
  TermTabularExportScope,
} from '@shared/constants/term-tabular';
import type { TranslationSpreadsheetConflictStrategy } from '@shared/constants/translation-spreadsheet';
import type { SourceWorkbookImportMode } from '@shared/constants/source-workbook-tabular';
import type { TabularMeta } from '@shared/schemas/tabular';
import type { DatabaseManager } from '../db/database-manager';

export interface TermTabularImportOptions {
  duplicateStrategy: TermTabularDuplicateStrategy;
  defaultImportStatus: TermTabularDefaultStatus;
  allowElevatedStatus: boolean;
}

export interface TermTabularExportOptions {
  exportScope: TermTabularExportScope;
}

export interface TabularColumnDef {
  key: string;
  header: string;
  required?: boolean;
}

export interface TabularRowValidation {
  status: TabularRowStatus;
  messages: string[];
  normalized: Record<string, string>;
}

export interface TranslationSpreadsheetImportOptions {
  conflictStrategy: TranslationSpreadsheetConflictStrategy;
}

export interface SourceWorkbookImportOptions {
  mode: SourceWorkbookImportMode;
}

export interface OperationalExportOptions {
  sanitize?: import('./operational-sanitize').OperationalSanitizeOptions;
  limit?: number;
}

export interface TabularCommitContext {
  db: DatabaseManager;
  projectId?: string;
  editionId?: string;
  meta?: TabularMeta;
  termImport?: TermTabularImportOptions;
  termExport?: TermTabularExportOptions;
  translationImport?: TranslationSpreadsheetImportOptions;
  sourceImport?: SourceWorkbookImportOptions;
  operationalExport?: OperationalExportOptions;
}

export interface TabularCommitResult {
  inserted: number;
  updated: number;
  skipped: number;
  undoEntries: TabularUndoEntry[];
}

export interface TabularUndoEntry {
  entityType: string;
  entityId: string;
  action: 'insert' | 'update';
  prior: Record<string, unknown> | null;
}

export interface TabularDataTypeHandler {
  dataType: TabularDataType;
  sheetName: string;
  columns: TabularColumnDef[];
  detectFromHeaders(headers: string[]): boolean;
  validateRow(
    row: Record<string, string>,
    rowIndex: number,
    ctx: TabularCommitContext,
  ): TabularRowValidation;
  naturalKey(row: Record<string, string>, ctx: TabularCommitContext): string;
  exportRows(ctx: TabularCommitContext): Record<string, string>[];
  commitRow(
    row: Record<string, string>,
    ctx: TabularCommitContext,
  ): { action: 'insert' | 'update' | 'skip'; undo?: TabularUndoEntry };
}

export interface ParsedTabularFile {
  format: 'csv' | 'xlsx';
  fileName: string;
  meta?: TabularMeta;
  sheets: Map<string, { headers: string[]; rows: Record<string, string>[] }>;
}

export interface TabularPreviewSession {
  previewId: string;
  filePath: string;
  fileName: string;
  format: 'csv' | 'xlsx';
  dataType: TabularDataType;
  meta?: TabularMeta;
  projectId?: string;
  editionId?: string;
  termImport?: TermTabularImportOptions;
  translationImport?: TranslationSpreadsheetImportOptions;
  sourceImport?: SourceWorkbookImportOptions;
  characterWorkbook?: boolean;
  sourceWorkbook?: boolean;
  projectDataWorkbook?: boolean;
  rows: Array<{
    rowIndex: number;
    status: TabularRowStatus;
    messages: string[];
    data: Record<string, string>;
    duplicateOfTermId?: string | null;
    duplicateAction?: string;
    hasConflict?: boolean;
  }>;
  stats: {
    total: number;
    valid: number;
    warning: number;
    error: number;
  };
  createdAt: number;
}
