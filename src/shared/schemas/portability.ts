import { z } from 'zod';
import {
  BACKUP_KINDS,
  NOVEL_EXPORT_FORMATS,
  TERM_IMPORT_DUPLICATE_STRATEGIES,
} from '../constants/portability';
import { TermDtoSchema } from './term';

export const NovelExportFormatSchema = z.enum(NOVEL_EXPORT_FORMATS);

export const NovelExportRequestSchema = z.object({
  projectId: z.string().uuid(),
  format: NovelExportFormatSchema,
  chapterFrom: z.number().int().positive().optional(),
  chapterTo: z.number().int().positive().optional(),
  translatedOnly: z.boolean().default(false),
  includeChapterTitles: z.boolean().default(true),
  includeParagraphIds: z.boolean().default(false),
  outputPath: z.string().min(1).optional(),
});

export const NovelExportResponseSchema = z.object({
  filePath: z.string(),
  chapterCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  format: NovelExportFormatSchema,
});

export const SelectExportPathRequestSchema = z.object({
  defaultName: z.string(),
  format: NovelExportFormatSchema,
});

export const SelectExportPathResponseSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().nullable(),
});

export const CreateBackupRequestSchema = z.object({
  kind: z.enum(BACKUP_KINDS),
  projectId: z.string().uuid().optional(),
  outputPath: z.string().min(1).optional(),
  includeCredentials: z.boolean().default(false),
});

export const CreateBackupResponseSchema = z.object({
  filePath: z.string(),
  kind: z.enum(BACKUP_KINDS),
  schemaVersion: z.number().int(),
});

export const BackupManifestSchema = z.object({
  formatVersion: z.number().int(),
  kind: z.enum(BACKUP_KINDS),
  appVersion: z.string(),
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  projectId: z.string().uuid().nullable(),
  projectTitle: z.string().nullable(),
  includesCredentials: z.boolean(),
  includesBrowserProfiles: z.boolean(),
});

export type BackupManifest = z.infer<typeof BackupManifestSchema>;

export const PreviewRestoreRequestSchema = z.object({
  archivePath: z.string().min(1),
});

export const RestorePreviewSummarySchema = z.object({
  projectTitle: z.string().nullable(),
  sourceLanguage: z.string().nullable(),
  targetLanguage: z.string().nullable(),
  chapterCount: z.number().int().nonnegative().nullable(),
  translationCount: z.number().int().nonnegative().nullable(),
  backupDate: z.string(),
});

export const PreviewRestoreResponseSchema = z.object({
  manifest: BackupManifestSchema,
  compatible: z.boolean(),
  warnings: z.array(z.string()),
  requiresOverwrite: z.boolean(),
  summary: RestorePreviewSummarySchema,
});

export const RestoreBackupRequestSchema = z.object({
  archivePath: z.string().min(1),
  confirmOverwrite: z.boolean(),
  targetProjectId: z.string().uuid().optional(),
});

export const RestoreBackupResponseSchema = z.object({
  restored: z.boolean(),
  message: z.string(),
  requiresRestart: z.boolean(),
});

export const AutoBackupConfigSchema = z.object({
  enabled: z.boolean(),
  intervalHours: z.number().int().positive(),
  retentionDaily: z.number().int().positive(),
  retentionWeekly: z.number().int().positive(),
  retentionMonthly: z.number().int().positive(),
  /** @deprecated Mirror of retentionDaily for legacy UI. */
  retentionCount: z.number().int().positive(),
  lastRunAt: z.string().nullable(),
});

export type AutoBackupConfig = z.infer<typeof AutoBackupConfigSchema>;

export const SetAutoBackupConfigRequestSchema = AutoBackupConfigSchema.pick({
  enabled: true,
  intervalHours: true,
  retentionDaily: true,
  retentionWeekly: true,
  retentionMonthly: true,
});

export const BackupDirectorySchema = z.object({
  directory: z.string(),
  isCustom: z.boolean(),
});

export const SetBackupDirectoryRequestSchema = z.object({
  directory: z.string().nullable(),
});

export const SelectBackupDirectoryResponseSchema = z.object({
  canceled: z.boolean(),
  directory: z.string().nullable(),
});

export const BackupEntrySchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  createdAt: z.string(),
  sizeBytes: z.number().int(),
  kind: z.enum(['auto', 'manual', 'migration', 'archive']).optional(),
});

export const ListBackupsResponseSchema = z.object({
  backups: z.array(BackupEntrySchema),
});

export const TermImportPreviewRequestSchema = z.object({
  format: z.enum(['csv', 'json']),
  content: z.string(),
  projectId: z.string().uuid().optional(),
});

export const TermImportPreviewRowSchema = z.object({
  rowIndex: z.number().int(),
  sourceText: z.string(),
  preferredTranslation: z.string().nullable(),
  scope: z.string().nullable(),
  duplicateOfTermId: z.string().uuid().nullable(),
  duplicateAction: z.enum(['new', 'duplicate']),
});

export const TermImportPreviewResponseSchema = z.object({
  rows: z.array(TermImportPreviewRowSchema),
  duplicateCount: z.number().int(),
});

export const TermCommitImportRequestSchema = z.object({
  format: z.enum(['csv', 'json']),
  content: z.string(),
  scope: z.enum(['GLOBAL', 'GENRE', 'PROJECT', 'USER']),
  scopeRef: z.string().uuid().nullable().optional(),
  duplicateStrategy: z.enum(TERM_IMPORT_DUPLICATE_STRATEGIES).default('skip'),
});

export const TermCommitImportResponseSchema = z.object({
  imported: z.number().int(),
  skipped: z.number().int(),
  merged: z.number().int(),
  terms: z.array(TermDtoSchema),
});
