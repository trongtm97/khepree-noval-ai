/** Batch multi-novel scan / preflight / commit. */

export const BATCH_IMPORT_PROPOSED_ACTIONS = [
  'CREATE',
  'UPDATE_EXISTING',
  'SKIP',
  'NEEDS_ATTENTION',
] as const;

export type BatchImportProposedAction = (typeof BATCH_IMPORT_PROPOSED_ACTIONS)[number];

export const BATCH_IMPORT_RESULT_STATUSES = [
  'PENDING',
  'RUNNING',
  'CREATED',
  'UPDATED',
  'SKIPPED',
  'SKIPPED_DUPLICATE',
  'NEEDS_ATTENTION',
  'FAILED',
] as const;

export type BatchImportResultStatus = (typeof BATCH_IMPORT_RESULT_STATUSES)[number];

export const BATCH_IMPORT_SESSION_STATUSES = [
  'PREFLIGHT',
  'COMMITTING',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;

export type BatchImportSessionStatus = (typeof BATCH_IMPORT_SESSION_STATUSES)[number];

export const BATCH_IMPORT_SOURCE_KINDS = ['folder', 'zip'] as const;
export type BatchImportSourceKind = (typeof BATCH_IMPORT_SOURCE_KINDS)[number];

export const BATCH_IMPORT_CANDIDATE_KINDS = ['folder', 'file'] as const;
export type BatchImportCandidateKind = (typeof BATCH_IMPORT_CANDIDATE_KINDS)[number];

export const BATCH_IMPORT_FORMATS = ['folder_txt', 'txt', 'epub', 'docx'] as const;
export type BatchImportFormat = (typeof BATCH_IMPORT_FORMATS)[number];

export const BATCH_IMPORT_WARNING_CODES = [
  'EMPTY_FILE',
  'EMPTY_FOLDER',
  'ENCODING_UNCERTAIN',
  'DUPLICATE_TITLE',
  'DUPLICATE_CONTENT',
  'UNCLEAR_CHAPTER_STRUCTURE',
  'CORRUPT_OR_UNREADABLE',
  'NO_CHAPTERS',
  'LIMIT_EXCEEDED',
] as const;

export type BatchImportWarningCode = (typeof BATCH_IMPORT_WARNING_CODES)[number];

/** Default safety limits — overridable in service options / tests. */
export const BATCH_IMPORT_DEFAULT_LIMITS = {
  maxZipEntries: 5_000,
  maxUncompressedBytes: 512 * 1024 * 1024,
  maxSingleEntryBytes: 100 * 1024 * 1024,
  maxDirectoryDepth: 12,
  maxCandidates: 200,
  maxRootListingEntries: 10_000,
} as const;

export type BatchImportLimits = {
  [K in keyof typeof BATCH_IMPORT_DEFAULT_LIMITS]: number;
};

export const BATCH_IMPORT_SESSION_TTL_MS = 60 * 60 * 1000;

/** Language shown only when heuristic is this confident + language-specific. */
export const BATCH_IMPORT_LANGUAGE_CONFIDENCE_MIN = 0.65;

export const NOVEL_FILE_EXTENSIONS = ['.txt', '.text', '.epub', '.docx'] as const;

/** Durable copies of ZIP-extracted novels (survives temp cleanup). */
export const BATCH_IMPORT_DURABLE_DIR = 'imported-sources' as const;
