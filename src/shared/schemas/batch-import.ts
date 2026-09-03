import { z } from 'zod';
import {
  BATCH_IMPORT_CANDIDATE_KINDS,
  BATCH_IMPORT_FORMATS,
  BATCH_IMPORT_PROPOSED_ACTIONS,
  BATCH_IMPORT_RESULT_STATUSES,
  BATCH_IMPORT_SESSION_STATUSES,
  BATCH_IMPORT_SOURCE_KINDS,
  BATCH_IMPORT_WARNING_CODES,
} from '../constants/batch-import';

export const BatchImportSelectSourceRequestSchema = z.object({
  preferredKind: z.enum(BATCH_IMPORT_SOURCE_KINDS).default('folder'),
});

export const BatchImportWarningSchema = z.object({
  code: z.enum(BATCH_IMPORT_WARNING_CODES),
  message: z.string().min(1),
});

export type BatchImportWarningDto = z.infer<typeof BatchImportWarningSchema>;

export const BatchImportCandidateSchema = z.object({
  candidateId: z.string().uuid(),
  selected: z.boolean(),
  kind: z.enum(BATCH_IMPORT_CANDIDATE_KINDS),
  format: z.enum(BATCH_IMPORT_FORMATS),
  /** Relative path under chosen root — never absolute outside selection. */
  displayPath: z.string().min(1),
  predictedTitle: z.string().min(1),
  fileCount: z.number().int().nonnegative(),
  chapterCount: z.number().int().nonnegative(),
  approximateCharCount: z.number().int().nonnegative(),
  languageCode: z.string().nullable(),
  languageConfidence: z.number().min(0).max(1).nullable(),
  contentFingerprint: z.string().min(1),
  warnings: z.array(BatchImportWarningSchema),
  proposedAction: z.enum(BATCH_IMPORT_PROPOSED_ACTIONS),
  matchedProjectId: z.string().uuid().nullable(),
  matchedProjectTitle: z.string().nullable(),
  targetProjectId: z.string().uuid().nullable(),
});

export type BatchImportCandidateDto = z.infer<typeof BatchImportCandidateSchema>;

export const BatchImportPreflightSchema = z.object({
  sessionId: z.string().uuid(),
  sourceKind: z.enum(BATCH_IMPORT_SOURCE_KINDS),
  /** Safe label for UI (folder name or zip file name). */
  sourceLabel: z.string().min(1),
  candidateCount: z.number().int().nonnegative(),
  selectedCount: z.number().int().nonnegative(),
  candidates: z.array(BatchImportCandidateSchema),
  scanWarnings: z.array(BatchImportWarningSchema),
});

export type BatchImportPreflightDto = z.infer<typeof BatchImportPreflightSchema>;

export const BatchImportSelectSourceResponseSchema = z.object({
  canceled: z.boolean(),
  sourceKind: z.enum(BATCH_IMPORT_SOURCE_KINDS).nullable(),
  /** Absolute path only returned when user just picked via dialog — scan uses it once. */
  sourcePath: z.string().nullable(),
});

export type BatchImportSelectSourceResponse = z.infer<
  typeof BatchImportSelectSourceResponseSchema
>;

export const BatchImportScanRequestSchema = z.object({
  sourceKind: z.enum(BATCH_IMPORT_SOURCE_KINDS),
  sourcePath: z.string().min(1),
});

export type BatchImportScanRequest = z.infer<typeof BatchImportScanRequestSchema>;

export const BatchImportScanResponseSchema = z.object({
  preflight: BatchImportPreflightSchema,
});

export const BatchImportSessionIdRequestSchema = z.object({
  sessionId: z.string().uuid(),
});

export const BatchImportCancelResponseSchema = z.object({
  ok: z.literal(true),
  cancelled: z.boolean(),
});

export const BatchImportDiscardResponseSchema = z.object({
  ok: z.literal(true),
});

export const BatchImportUpdateCandidateRequestSchema = z.object({
  sessionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  selected: z.boolean().optional(),
  predictedTitle: z.string().min(1).max(500).optional(),
  proposedAction: z.enum(BATCH_IMPORT_PROPOSED_ACTIONS).optional(),
  targetProjectId: z.string().uuid().nullable().optional(),
});

export const BatchImportUpdateCandidateResponseSchema = z.object({
  preflight: BatchImportPreflightSchema,
});

export const BatchImportProgressEventSchema = z.object({
  sessionId: z.string().uuid().nullable(),
  phase: z.enum([
    'preparing',
    'extracting',
    'discovering',
    'analyzing',
    'done',
    'cancelled',
    'error',
    'materializing',
    'committing',
    'commit_done',
  ]),
  processed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  currentLabel: z.string().nullable(),
  message: z.string().nullable(),
});

export type BatchImportProgressEventDto = z.infer<typeof BatchImportProgressEventSchema>;

export const BatchImportProjectOptionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
});

export const BatchImportListProjectsResponseSchema = z.object({
  projects: z.array(BatchImportProjectOptionSchema),
});

export const BatchImportSummarySchema = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  skippedDuplicate: z.number().int().nonnegative(),
  needsAttention: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type BatchImportSummaryDto = z.infer<typeof BatchImportSummarySchema>;

export const BatchImportCandidateResultSchema = z.object({
  candidateId: z.string().uuid(),
  displayPath: z.string(),
  predictedTitle: z.string(),
  kind: z.enum(BATCH_IMPORT_CANDIDATE_KINDS),
  format: z.enum(BATCH_IMPORT_FORMATS),
  proposedAction: z.enum(BATCH_IMPORT_PROPOSED_ACTIONS),
  selected: z.boolean(),
  status: z.enum(BATCH_IMPORT_RESULT_STATUSES),
  projectId: z.string().uuid().nullable(),
  chaptersCreated: z.array(z.number().int().positive()),
  chaptersUpdated: z.array(z.number().int().positive()),
  chaptersMissing: z.array(z.number().int().positive()),
  chaptersUnchanged: z.array(z.number().int().positive()),
  preservedLockedParagraphs: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  nextAction: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
});

export type BatchImportCandidateResultDto = z.infer<typeof BatchImportCandidateResultSchema>;

export const BatchImportSessionDetailSchema = z.object({
  sessionId: z.string().uuid(),
  sourceKind: z.enum(BATCH_IMPORT_SOURCE_KINDS),
  sourceLabel: z.string(),
  status: z.enum(BATCH_IMPORT_SESSION_STATUSES),
  summary: BatchImportSummarySchema,
  completedAt: z.string().nullable(),
  candidates: z.array(BatchImportCandidateResultSchema),
});

export type BatchImportSessionDetailDto = z.infer<typeof BatchImportSessionDetailSchema>;

export const BatchImportCommitRequestSchema = BatchImportSessionIdRequestSchema;
export const BatchImportCommitResponseSchema = z.object({
  session: BatchImportSessionDetailSchema,
});

export const BatchImportRetryCandidateRequestSchema = z.object({
  sessionId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

export const BatchImportRetryCandidateResponseSchema = z.object({
  session: BatchImportSessionDetailSchema,
});

export const BatchImportGetSessionResponseSchema = z.object({
  session: BatchImportSessionDetailSchema,
});

export const BatchImportListSessionsResponseSchema = z.object({
  sessions: z.array(BatchImportSessionDetailSchema),
  incomplete: z.array(BatchImportSessionDetailSchema),
});
