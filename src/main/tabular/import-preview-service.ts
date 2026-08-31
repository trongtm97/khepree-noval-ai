import { randomUUID } from 'node:crypto';
import { TABULAR_PREVIEW_MAX_ROWS, type TabularDataType } from '@shared/constants/tabular';
import type {
  TermTabularDefaultStatus,
  TermTabularDuplicateStrategy,
} from '@shared/constants/term-tabular';
import type { TranslationSpreadsheetConflictStrategy } from '@shared/constants/translation-spreadsheet';
import { TRANSLATION_SPREADSHEET_SHEET, TRANSLATION_SPREADSHEET_WARNINGS } from '@shared/constants/translation-spreadsheet';
import type { TabularPreviewResponse } from '@shared/schemas/tabular';
import { getDatabase } from '../db/connection';
import { tabularSchemaRegistry } from './tabular-schema-registry';
import { assertKhepreeTabularMeta, parseTabularFile } from './tabular-file-parser';
import { findExistingTerm } from './handlers/term-tabular-utils';
import type { CharacterWorkbookSheet } from '@shared/constants/character-tabular';
import {
  CHARACTER_TABULAR_WARNINGS,
  CHARACTER_WORKBOOK_COMMIT_ORDER,
} from '@shared/constants/character-tabular';
import type {
  TabularPreviewSession,
  TermTabularImportOptions,
  TranslationSpreadsheetImportOptions,
} from './types';
import { isCharacterWorkbookFile } from './character-workbook-export';
import { validateWorkbookRow } from './handlers/character-workbook-handler';
import { isLegacyCharacterHeaders } from './handlers/character-tabular-utils';
import type { ProjectDataWorkbookSheet } from '@shared/constants/project-data-tabular';
import {
  PROJECT_DATA_COMMIT_ORDER,
  PROJECT_DATA_WARNINGS,
} from '@shared/constants/project-data-tabular';
import type { SourceWorkbookImportMode } from '@shared/constants/source-workbook-tabular';
import type { SourceWorkbookSheet } from '@shared/constants/source-workbook-tabular';
import {
  SOURCE_WORKBOOK_COMMIT_ORDER,
  SOURCE_WORKBOOK_WARNINGS,
} from '@shared/constants/source-workbook-tabular';
import { isProjectDataWorkbookFile } from './project-data-workbook-export';
import { validateProjectDataRow } from './handlers/project-data-workbook-handler';
import { isSourceWorkbookFile } from './source-workbook-export';
import { validateSourceWorkbookRow } from './handlers/source-workbook-handler';
import { applyColumnMapping, headersNeedMapping } from './column-mapping';
import type { SourceWorkbookImportOptions } from './types';

const sessions = new Map<string, TabularPreviewSession>();
const SESSION_TTL_MS = 30 * 60 * 1000;

function pruneSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

export class ImportPreviewService {
  async preview(input: {
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
    pruneSessions();
    const parsed = await parseTabularFile(input.filePath);
    assertKhepreeTabularMeta(parsed.meta);

    const dataTypeHint = input.dataTypeHint ?? (parsed.meta?.data_type as TabularDataType | undefined);
    const characterWorkbook =
      dataTypeHint === 'characters' && isCharacterWorkbookFile(parsed.sheets);
    const projectDataWorkbook =
      (dataTypeHint === 'project_data' || parsed.meta?.data_type === 'project_data') &&
      isProjectDataWorkbookFile(parsed.sheets);
    const sourceWorkbook =
      (dataTypeHint === 'source_workbook' || parsed.meta?.data_type === 'source_workbook') &&
      (isSourceWorkbookFile(parsed.sheets) || parsed.format === 'csv');

    const primarySheet =
      parsed.sheets.get(TRANSLATION_SPREADSHEET_SHEET) ??
      parsed.sheets.get('translations') ??
      parsed.sheets.get('PROJECT') ??
      parsed.sheets.get('CHARACTERS') ??
      parsed.sheets.get('characters') ??
      [...parsed.sheets.entries()].find(
        ([name]) =>
          name !== '_META' &&
          name !== 'QA_ISSUES' &&
          name !== 'TERMS_REFERENCE' &&
          name !== 'CHARACTER_TRANSLATIONS' &&
          name !== 'RELATIONSHIPS' &&
          name !== 'RELATIONSHIP_RENDERING' &&
          name !== 'RULES' &&
          name !== 'WORLD_KNOWLEDGE' &&
          name !== 'STORY_FACTS' &&
          name !== 'CHAPTERS' &&
          name !== 'PARAGRAPHS',
      )?.[1] ??
      parsed.sheets.values().next().value;
    if (!primarySheet && !characterWorkbook && !projectDataWorkbook && !sourceWorkbook) {
      throw new Error('No data rows found in file');
    }

    const dataType =
      sourceWorkbook
        ? 'source_workbook'
        : characterWorkbook
          ? 'characters'
          : projectDataWorkbook
            ? 'project_data'
            : tabularSchemaRegistry.detectDataType(
                primarySheet?.headers ?? [],
                parsed.meta?.data_type as TabularDataType | undefined,
              ) ?? dataTypeHint;
    if (!dataType) {
      throw new Error('Could not detect tabular data type from headers');
    }

    const termImport: TermTabularImportOptions | undefined =
      dataType === 'terms'
        ? {
            duplicateStrategy: input.duplicateStrategy ?? 'SKIP',
            defaultImportStatus: input.defaultImportStatus ?? 'CANDIDATE',
            allowElevatedStatus: input.allowElevatedStatus ?? false,
          }
        : undefined;

    const translationImport: TranslationSpreadsheetImportOptions | undefined =
      dataType === 'translations'
        ? { conflictStrategy: input.conflictStrategy ?? 'USE_EXCEL' }
        : undefined;

    const sourceImport: SourceWorkbookImportOptions | undefined =
      dataType === 'source_workbook'
        ? { mode: input.sourceImportMode ?? 'METADATA_ONLY' }
        : undefined;

    const handler = tabularSchemaRegistry.getHandler(dataType);
    const sourceHeaders = primarySheet?.headers ?? [];
    const requiredKeys = handler.columns.filter((c) => c.required).map((c) => c.key);
    const needsColumnMapping =
      sourceHeaders.length > 0 &&
      requiredKeys.length > 0 &&
      headersNeedMapping(sourceHeaders, requiredKeys);

    const ctx = {
      db: getDatabase(),
      projectId: input.projectId ?? parsed.meta?.project_id,
      editionId: input.editionId ?? parsed.meta?.edition_id,
      meta: parsed.meta,
      termImport,
      translationImport,
      sourceImport,
    };

    let duplicateCount = 0;
    let conflictCount = 0;

    const validated = characterWorkbook
      ? this.validateCharacterWorkbook(parsed.sheets, ctx, (count) => {
          conflictCount = count;
        })
      : projectDataWorkbook
        ? this.validateProjectDataWorkbook(parsed.sheets, ctx, (count) => {
            conflictCount = count;
          })
        : sourceWorkbook
          ? this.validateSourceWorkbook(parsed.sheets, ctx, (count) => {
              conflictCount = count;
            })
          : (primarySheet?.rows ?? []).map((row, rowIndex) => {
          const legacyRow =
            dataType === 'characters' && isLegacyCharacterHeaders(primarySheet!.headers)
              ? { ...row, _legacy: '1' }
              : row;
          const mappedRow = applyColumnMapping(legacyRow, input.columnMapping);
          const result = handler.validateRow(mappedRow, rowIndex + 2, ctx);
          let duplicateOfTermId: string | null = null;
          let duplicateAction: string | undefined;
          let hasConflict = false;
          if (dataType === 'terms' && result.normalized.source_text) {
            const existing = findExistingTerm(result.normalized, ctx);
            if (existing) {
              duplicateCount += 1;
              duplicateOfTermId = existing.id;
              duplicateAction = termImport?.duplicateStrategy ?? 'SKIP';
            }
          }
          if (result.messages.includes(TRANSLATION_SPREADSHEET_WARNINGS.CONFLICT_APP_NEWER)) {
            conflictCount += 1;
            hasConflict = true;
          }
          return {
            rowIndex: rowIndex + 2,
            status: result.status,
            messages: result.messages,
            data: result.normalized,
            duplicateOfTermId,
            duplicateAction,
            hasConflict,
          };
        });

    const stats = {
      total: validated.length,
      valid: validated.filter((r) => r.status === 'valid').length,
      warning: validated.filter((r) => r.status === 'warning').length,
      error: validated.filter((r) => r.status === 'error').length,
    };

    const previewId = randomUUID();
    sessions.set(previewId, {
      previewId,
      filePath: input.filePath,
      fileName: parsed.fileName,
      format: parsed.format,
      dataType,
      meta: parsed.meta,
      projectId: ctx.projectId,
      editionId: ctx.editionId,
      termImport,
      translationImport,
      sourceImport,
      characterWorkbook,
      sourceWorkbook,
      projectDataWorkbook,
      rows: validated,
      stats,
      createdAt: Date.now(),
    });

    return {
      previewId,
      fileName: parsed.fileName,
      format: parsed.format,
      dataType,
      meta: parsed.meta,
      totalRows: stats.total,
      validCount: stats.valid,
      warningCount: stats.warning,
      errorCount: stats.error,
      duplicateCount: dataType === 'terms' ? duplicateCount : undefined,
      conflictCount:
        dataType === 'translations' ||
        dataType === 'characters' ||
        dataType === 'project_data' ||
        dataType === 'source_workbook'
          ? conflictCount
          : undefined,
      sourceHeaders,
      needsColumnMapping,
      rows: validated.slice(0, TABULAR_PREVIEW_MAX_ROWS),
    };
  }

  getSession(previewId: string): TabularPreviewSession | null {
    pruneSessions();
    return sessions.get(previewId) ?? null;
  }

  discard(previewId: string): void {
    sessions.delete(previewId);
  }

  private validateCharacterWorkbook(
    sheets: Map<string, { headers: string[]; rows: Record<string, string>[] }>,
    ctx: {
      db: ReturnType<typeof getDatabase>;
      projectId?: string;
      editionId?: string;
      meta?: import('@shared/schemas/tabular').TabularMeta;
      termImport?: TermTabularImportOptions;
      translationImport?: TranslationSpreadsheetImportOptions;
    },
    onConflicts: (count: number) => void,
  ) {
    const rows: TabularPreviewSession['rows'] = [];
    let conflictCount = 0;
    let rowCounter = 2;

    for (const sheetName of CHARACTER_WORKBOOK_COMMIT_ORDER) {
      const sheet =
        sheets.get(sheetName) ??
        sheets.get(sheetName.toLowerCase());
      if (!sheet || sheet.rows.length === 0) continue;

      for (const row of sheet.rows) {
        const result = validateWorkbookRow(sheetName as CharacterWorkbookSheet, row, rowCounter, ctx);
        const hasConflict =
          result.messages.includes(CHARACTER_TABULAR_WARNINGS.AMBIGUOUS_CHARACTER) ||
          result.messages.includes(CHARACTER_TABULAR_WARNINGS.DISPLAY_NAME_COLLISION);
        if (hasConflict) conflictCount += 1;
        rows.push({
          rowIndex: rowCounter,
          status: result.status,
          messages: result.messages.map((m) => `[${sheetName}] ${m}`),
          data: result.normalized,
          hasConflict,
        });
        rowCounter += 1;
      }
    }

    onConflicts(conflictCount);
    return rows;
  }

  private validateProjectDataWorkbook(
    sheets: Map<string, { headers: string[]; rows: Record<string, string>[] }>,
    ctx: {
      db: ReturnType<typeof getDatabase>;
      projectId?: string;
      editionId?: string;
      meta?: import('@shared/schemas/tabular').TabularMeta;
      termImport?: TermTabularImportOptions;
      translationImport?: TranslationSpreadsheetImportOptions;
    },
    onConflicts: (count: number) => void,
  ) {
    const rows: TabularPreviewSession['rows'] = [];
    let conflictCount = 0;
    let rowCounter = 2;

    for (const sheetName of PROJECT_DATA_COMMIT_ORDER) {
      const sheet = sheets.get(sheetName);
      if (!sheet) continue;
      const dataRows = sheetName === 'PROJECT' ? sheet.rows.slice(0, 1) : sheet.rows;
      if (dataRows.length === 0 && sheetName !== 'PROJECT') continue;

      for (const row of dataRows) {
        const result = validateProjectDataRow(
          sheetName as ProjectDataWorkbookSheet,
          row,
          rowCounter,
          ctx,
        );
        const hasConflict = result.messages.includes(
          PROJECT_DATA_WARNINGS.STORY_FACTS_ADVANCED,
        );
        if (hasConflict) conflictCount += 1;
        rows.push({
          rowIndex: rowCounter,
          status: result.status,
          messages: result.messages.map((m) => `[${sheetName}] ${m}`),
          data: result.normalized,
          hasConflict,
        });
        rowCounter += 1;
      }
    }

    onConflicts(conflictCount);
    return rows;
  }

  private validateSourceWorkbook(
    sheets: Map<string, { headers: string[]; rows: Record<string, string>[] }>,
    ctx: {
      db: ReturnType<typeof getDatabase>;
      projectId?: string;
      editionId?: string;
      meta?: import('@shared/schemas/tabular').TabularMeta;
      termImport?: TermTabularImportOptions;
      translationImport?: TranslationSpreadsheetImportOptions;
      sourceImport?: SourceWorkbookImportOptions;
    },
    onConflicts: (count: number) => void,
  ) {
    const rows: TabularPreviewSession['rows'] = [];
    let conflictCount = 0;
    let rowCounter = 2;

    const paragraphOnlyCsv =
      !sheets.has('CHAPTERS') &&
      !sheets.has('chapters') &&
      (sheets.has('PARAGRAPHS') ||
        sheets.has('paragraphs') ||
        [...sheets.values()].some((s) => s.headers.includes('paragraph_id')));

    const sheetOrder = paragraphOnlyCsv
      ? (['PARAGRAPHS'] as SourceWorkbookSheet[])
      : SOURCE_WORKBOOK_COMMIT_ORDER;

    for (const sheetName of sheetOrder) {
      const sheet =
        sheets.get(sheetName) ??
        sheets.get(sheetName.toLowerCase()) ??
        (paragraphOnlyCsv ? [...sheets.values()].find((s) => s.headers.includes('paragraph_id')) : undefined);
      if (!sheet || sheet.rows.length === 0) continue;

      for (const row of sheet.rows) {
        const result = validateSourceWorkbookRow(
          sheetName as SourceWorkbookSheet,
          row,
          rowCounter,
          ctx,
        );
        const hasConflict =
          result.messages.includes(SOURCE_WORKBOOK_WARNINGS.SOURCE_OVERWRITE_BLOCKED) ||
          result.messages.includes(SOURCE_WORKBOOK_WARNINGS.NEEDS_RETRANSLATION);
        if (hasConflict) conflictCount += 1;
        rows.push({
          rowIndex: rowCounter,
          status: result.status,
          messages: result.messages.map((m) => `[${sheetName}] ${m}`),
          data: result.normalized,
          hasConflict,
        });
        rowCounter += 1;
      }
    }

    onConflicts(conflictCount);
    return rows;
  }
}

export const importPreviewService = new ImportPreviewService();
