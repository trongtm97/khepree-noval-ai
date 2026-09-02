import { z } from 'zod';
import {
  TABULAR_DATA_TYPES,
  TABULAR_FORMATS,
  TABULAR_IMPORT_MODES,
  TABULAR_ROW_STATUSES,
} from '../constants/tabular';
import {
  TERM_TABULAR_DEFAULT_STATUSES,
  TERM_TABULAR_DUPLICATE_STRATEGIES,
  TERM_TABULAR_EXPORT_SCOPES,
} from '../constants/term-tabular';
import {
  TRANSLATION_SPREADSHEET_CONFLICT_STRATEGIES,
} from '../constants/translation-spreadsheet';
import {
  SOURCE_WORKBOOK_IMPORT_MODES,
} from '../constants/source-workbook-tabular';

export const TabularMetaSchema = z.object({
  khepree_format: z.string().optional(),
  /** @deprecated legacy export field */
  khepree_novel_ai_format: z.string().optional(),
  /** @deprecated NovelTrans-era export field */
  noveltrans_format: z.string().optional(),
  schema_version: z.union([z.string(), z.number()]).optional(),
  exported_at: z.string().optional(),
  data_type: z.enum(TABULAR_DATA_TYPES).optional(),
  project_id: z.string().uuid().optional(),
  edition_id: z.string().uuid().optional(),
  source_language: z.string().optional(),
  target_language: z.string().optional(),
});

export type TabularMeta = z.infer<typeof TabularMetaSchema>;

export const TabularPreviewRowSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  status: z.enum(TABULAR_ROW_STATUSES),
  messages: z.array(z.string()),
  data: z.record(z.string()),
  duplicateOfTermId: z.string().uuid().nullable().optional(),
  duplicateAction: z.string().optional(),
  hasConflict: z.boolean().optional(),
});

export const TabularSelectFileRequestSchema = z.object({
  dataType: z.enum(TABULAR_DATA_TYPES),
  format: z.enum(['csv', 'xlsx', 'any']).default('any'),
});

export const TabularSelectFileResponseSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().nullable(),
  detectedFormat: z.enum(TABULAR_FORMATS).nullable(),
});

export const TabularPreviewRequestSchema = z.object({
  filePath: z.string().min(1),
  projectId: z.string().uuid().optional(),
  editionId: z.string().uuid().optional(),
  dataTypeHint: z.enum(TABULAR_DATA_TYPES).optional(),
  duplicateStrategy: z.enum(TERM_TABULAR_DUPLICATE_STRATEGIES).default('SKIP'),
  defaultImportStatus: z.enum(TERM_TABULAR_DEFAULT_STATUSES).default('CANDIDATE'),
  allowElevatedStatus: z.boolean().default(false),
  conflictStrategy: z.enum(TRANSLATION_SPREADSHEET_CONFLICT_STRATEGIES).optional(),
  sourceImportMode: z.enum(SOURCE_WORKBOOK_IMPORT_MODES).optional(),
  columnMapping: z.record(z.string()).optional(),
});

export const TabularPreviewResponseSchema = z.object({
  previewId: z.string().uuid(),
  fileName: z.string(),
  format: z.enum(TABULAR_FORMATS),
  dataType: z.enum(TABULAR_DATA_TYPES),
  meta: TabularMetaSchema.optional(),
  totalRows: z.number().int().nonnegative(),
  validCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative().optional(),
  conflictCount: z.number().int().nonnegative().optional(),
  sourceHeaders: z.array(z.string()).optional(),
  needsColumnMapping: z.boolean().optional(),
  rows: z.array(TabularPreviewRowSchema),
});

export const TabularCommitRequestSchema = z.object({
  previewId: z.string().uuid(),
  mode: z.enum(TABULAR_IMPORT_MODES).default('IMPORT_VALID_ONLY'),
  projectId: z.string().uuid().optional(),
  editionId: z.string().uuid().optional(),
  duplicateStrategy: z.enum(TERM_TABULAR_DUPLICATE_STRATEGIES).optional(),
  defaultImportStatus: z.enum(TERM_TABULAR_DEFAULT_STATUSES).optional(),
  allowElevatedStatus: z.boolean().optional(),
  conflictStrategy: z.enum(TRANSLATION_SPREADSHEET_CONFLICT_STRATEGIES).optional(),
  sourceImportMode: z.enum(SOURCE_WORKBOOK_IMPORT_MODES).optional(),
});

export const TabularCommitResponseSchema = z.object({
  importId: z.string().uuid(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  rolledBack: z.boolean(),
  message: z.string(),
});

export const TabularDiscardPreviewRequestSchema = z.object({
  previewId: z.string().uuid(),
});

export const TabularExportRequestSchema = z.object({
  dataType: z.enum(TABULAR_DATA_TYPES),
  format: z.enum(TABULAR_FORMATS),
  outputPath: z.string().min(1).optional(),
  projectId: z.string().uuid().optional(),
  editionId: z.string().uuid().optional(),
  utf8Bom: z.boolean().default(true),
  exportScope: z.enum(TERM_TABULAR_EXPORT_SCOPES).optional(),
  operationalOptions: z
    .object({
      sanitizeEmail: z.boolean().default(true),
      limit: z.number().int().positive().max(50000).optional(),
    })
    .optional(),
});

export const TabularDownloadTermTemplateRequestSchema = z.object({
  outputPath: z.string().min(1).optional(),
});

export const TabularDownloadTermTemplateResponseSchema = z.object({
  filePath: z.string(),
});

export const TabularExportResponseSchema = z.object({
  filePath: z.string(),
  format: z.enum(TABULAR_FORMATS),
  rowCount: z.number().int().nonnegative(),
});

export const TabularSelectExportPathRequestSchema = z.object({
  dataType: z.enum(TABULAR_DATA_TYPES),
  format: z.enum(TABULAR_FORMATS),
  defaultName: z.string(),
});

export const TabularUndoLastRequestSchema = z.object({
  projectId: z.string().uuid().optional(),
});

export const TabularUndoLastResponseSchema = z.object({
  undone: z.boolean(),
  importId: z.string().uuid().nullable(),
  message: z.string(),
});

export const TabularImportHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  editionId: z.string().uuid().nullable(),
  dataType: z.string(),
  fileName: z.string(),
  fileFormat: z.string(),
  rowCount: z.number().int(),
  insertedCount: z.number().int(),
  updatedCount: z.number().int(),
  skippedCount: z.number().int(),
  errorCount: z.number().int(),
  status: z.string(),
  createdAt: z.string(),
});

export const TabularListHistoryResponseSchema = z.object({
  entries: z.array(TabularImportHistoryEntrySchema),
});

export type TabularPreviewRow = z.infer<typeof TabularPreviewRowSchema>;
export type TabularSelectFileResponse = z.infer<typeof TabularSelectFileResponseSchema>;
export type TabularPreviewResponse = z.infer<typeof TabularPreviewResponseSchema>;
export type TabularCommitResponse = z.infer<typeof TabularCommitResponseSchema>;
export type TabularExportResponse = z.infer<typeof TabularExportResponseSchema>;
export type TabularUndoLastResponse = z.infer<typeof TabularUndoLastResponseSchema>;
export type TabularImportHistoryEntry = z.infer<typeof TabularImportHistoryEntrySchema>;
