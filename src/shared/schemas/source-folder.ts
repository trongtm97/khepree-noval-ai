import { z } from 'zod';
import {
  SOURCE_FOLDER_STATUSES,
  SOURCE_MODES,
} from '../constants/source-folder';
import {
  BookMetadataPreviewSchema,
  ClassifiedFileEntrySchema,
  ScannedDocumentEntrySchema,
  ScannedSpecialChapterEntrySchema,
} from './book-metadata';

export const DetectedChapterFileSchema = z.object({
  chapterNumber: z.number().int().positive(),
  chapterTitle: z.string(),
  sourceFilePath: z.string(),
  sourceFileName: z.string(),
  sourceFileSize: z.number().int().nonnegative(),
  fileModifiedAt: z.string(),
  sourceFileHash: z.string(),
  contentHash: z.string(),
  encoding: z.string(),
  confidence: z.number(),
  detectionSource: z.enum(['filename', 'heading', 'conflict']),
  normalizedText: z.string(),
  readError: z.string().optional(),
});

export type DetectedChapterFileDto = z.infer<typeof DetectedChapterFileSchema>;

export const FolderScanChapterEntrySchema = z.object({
  chapterNumber: z.number().int().positive(),
  chapterTitle: z.string(),
  sourceFilePath: z.string(),
  sourceFileName: z.string(),
  sourceFileHash: z.string(),
  contentHash: z.string(),
  status: z.enum(['new', 'unchanged', 'modified', 'duplicate', 'conflict', 'error']),
  existingChapterId: z.string().uuid().optional(),
  duplicateOfPath: z.string().optional(),
  errorMessage: z.string().optional(),
});

export const FolderScanResultSchema = z.object({
  filesTotal: z.number().int().nonnegative(),
  recognizedFiles: z.number().int().nonnegative(),
  newChapters: z.array(FolderScanChapterEntrySchema),
  existingUnchanged: z.array(FolderScanChapterEntrySchema),
  modifiedChapters: z.array(FolderScanChapterEntrySchema),
  missingChapters: z.array(
    z.object({
      chapterNumber: z.number().int().positive(),
      chapterId: z.string().uuid(),
      sourceFilePath: z.string().nullable(),
    }),
  ),
  duplicateChapters: z.array(
    z.object({
      chapterNumber: z.number().int().positive(),
      files: z.array(
        z.object({
          sourceFilePath: z.string(),
          contentHash: z.string(),
        }),
      ),
    }),
  ),
  conflicts: z.array(
    z.object({
      chapterNumber: z.number().int().positive(),
      files: z.array(DetectedChapterFileSchema),
    }),
  ),
  unrecognizedFiles: z.array(z.string()),
  errors: z.array(
    z.object({
      sourceFilePath: z.string(),
      message: z.string(),
    }),
  ),
  missingSequenceGaps: z.array(z.number().int().positive()),
  chapterRange: z
    .object({
      min: z.number().int().positive(),
      max: z.number().int().positive(),
    })
    .nullable(),
  bookMetadata: BookMetadataPreviewSchema.nullable(),
  projectDocuments: z.array(ScannedDocumentEntrySchema),
  specialChapters: z.array(ScannedSpecialChapterEntrySchema),
  classifiedFiles: z.array(ClassifiedFileEntrySchema),
  normalChapterCount: z.number().int().nonnegative(),
  specialChapterCount: z.number().int().nonnegative(),
  documentCount: z.number().int().nonnegative(),
});

export type FolderScanResultDto = z.infer<typeof FolderScanResultSchema>;

export const SourceFolderSettingsSchema = z.object({
  sourceMode: z.enum(SOURCE_MODES),
  sourceFolderPath: z.string().nullable(),
  sourceFolderStatus: z.enum(SOURCE_FOLDER_STATUSES).nullable(),
  watchFolderEnabled: z.boolean(),
  scanOnStartup: z.boolean(),
  autoImportNewChapters: z.boolean(),
  autoQueueNewChapters: z.boolean(),
  autoTranslateNewChapters: z.boolean(),
  expectedStartChapter: z.number().int().positive().nullable(),
  expectedEndChapter: z.number().int().positive().nullable(),
  lastFolderScanAt: z.string().nullable(),
});

export type SourceFolderSettingsDto = z.infer<typeof SourceFolderSettingsSchema>;

export const FolderPreviewDtoSchema = z.object({
  previewId: z.string().uuid(),
  folderPath: z.string(),
  scanResult: FolderScanResultSchema,
});

export type FolderPreviewDto = z.infer<typeof FolderPreviewDtoSchema>;

export const SourceFolderStatusSchema = z.object({
  projectId: z.string().uuid(),
  settings: SourceFolderSettingsSchema,
  scanSummary: z
    .object({
      filesTotal: z.number().int().nonnegative(),
      recognizedFiles: z.number().int().nonnegative(),
      newCount: z.number().int().nonnegative(),
      modifiedCount: z.number().int().nonnegative(),
      missingCount: z.number().int().nonnegative(),
      conflictCount: z.number().int().nonnegative(),
      errorCount: z.number().int().nonnegative(),
      watching: z.boolean(),
    })
    .nullable(),
});

export const SourceFolderSelectFolderResponseSchema = z.object({
  canceled: z.boolean(),
  folderPath: z.string().nullable(),
});

export const SourceFolderScanPreviewRequestSchema = z.object({
  folderPath: z.string().min(1),
  expectedStartChapter: z.number().int().positive().optional(),
  expectedEndChapter: z.number().int().positive().optional(),
});

export const SourceFolderScanRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const SourceFolderDetectLanguageRequestSchema = z.object({
  previewId: z.string().uuid(),
  sourceLanguageHint: z.string().min(2).max(32).nullable().optional(),
  sourceLanguageMode: z.enum(['AUTO', 'HINTED']).optional(),
});

export const SourceFolderImportRequestSchema = z
  .object({
  previewId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  projectTitle: z.string().min(1).max(500),
  genre: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  chineseTitle: z.string().max(500).nullable().optional(),
  /** @deprecated Hint only — use sourceLanguageHint */
  sourceLanguage: z.string().min(2).max(32).optional(),
  sourceLanguageHint: z.string().min(2).max(32).nullable().optional(),
  sourceLanguageMode: z.enum(['AUTO', 'HINTED']).optional(),
  targetLanguage: z.string().min(2).max(32).optional(),
  accountId: z.string().uuid().nullable().optional(),
  styleConfig: z.record(z.unknown()).nullable().optional(),
  expectedStartChapter: z.number().int().positive().nullable().optional(),
  expectedEndChapter: z.number().int().positive().nullable().optional(),
  chapterNumbers: z.array(z.number().int().positive()).optional(),
})
  .transform((data) => {
    const legacyHint = (data as Record<string, unknown>).sourceLanguage;
    const rest = { ...data };
    delete (rest as Record<string, unknown>).sourceLanguage;
    return {
      ...rest,
      sourceLanguageHint:
        rest.sourceLanguageHint ??
        (typeof legacyHint === 'string' ? legacyHint : null),
    };
  });

export const SourceFolderUpdateSettingsRequestSchema = z.object({
  projectId: z.string().uuid(),
  watchFolderEnabled: z.boolean().optional(),
  scanOnStartup: z.boolean().optional(),
  autoImportNewChapters: z.boolean().optional(),
  autoQueueNewChapters: z.boolean().optional(),
  autoTranslateNewChapters: z.boolean().optional(),
  expectedStartChapter: z.number().int().positive().nullable().optional(),
  expectedEndChapter: z.number().int().positive().nullable().optional(),
});

export const SourceFolderChangeFolderRequestSchema = z.object({
  projectId: z.string().uuid(),
  newFolderPath: z.string().min(1),
  confirm: z.boolean().optional(),
});

export const SourceFolderResolveConflictRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  chosenFilePath: z.string().min(1),
});

export const SourceFolderMarkRetranslateRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

export const SourceFolderGetDiffRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

export const SourceDiffLineSchema = z.object({
  kind: z.enum(['unchanged', 'added', 'removed', 'changed']),
  oldLine: z.string().optional(),
  newLine: z.string().optional(),
  lineNumber: z.number().int().nonnegative(),
});

export const SourceFolderGetDiffResponseSchema = z.object({
  oldText: z.string(),
  newText: z.string(),
  lines: z.array(SourceDiffLineSchema),
});

export const SourceFolderEventSchema = z.object({
  type: z.enum([
    'scan_progress',
    'scan_completed',
    'new_chapters',
    'modified_chapter',
    'missing_chapter',
    'conflict',
    'folder_unavailable',
    'chapters_imported',
  ]),
  projectId: z.string().uuid().optional(),
  message: z.string(),
  detail: z.record(z.unknown()).optional(),
});

export type SourceFolderEventDto = z.infer<typeof SourceFolderEventSchema>;
