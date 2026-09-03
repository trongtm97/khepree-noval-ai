export const SOURCE_MODES = ['LEGACY_IMPORT', 'FOLDER'] as const;
export type SourceMode = (typeof SOURCE_MODES)[number];

export const SOURCE_FOLDER_STATUSES = ['AVAILABLE', 'UNAVAILABLE'] as const;
export type SourceFolderStatus = (typeof SOURCE_FOLDER_STATUSES)[number];

export const CHAPTER_SOURCE_STATUSES = [
  'NO_SOURCE',
  'SOURCE_READY',
  'SOURCE_MODIFIED',
  'SOURCE_MISSING',
  'SOURCE_CONFLICT',
  'SOURCE_ERROR',
] as const;
export type ChapterSourceStatus = (typeof CHAPTER_SOURCE_STATUSES)[number];

export const SOURCE_FOLDER_LOG_EVENTS = [
  'SCAN_STARTED',
  'SCAN_COMPLETED',
  'FILE_ADDED',
  'FILE_CHANGED',
  'FILE_MISSING',
  'CHAPTER_DETECTED',
  'CHAPTER_CONFLICT',
  'CHAPTER_IMPORTED',
] as const;
export type SourceFolderLogEvent = (typeof SOURCE_FOLDER_LOG_EVENTS)[number];

export const DEFAULT_SCAN_CONCURRENCY = 8;
export const DEFAULT_WATCH_DEBOUNCE_MS = 1500;
export const DEFAULT_WATCH_BATCH_COALESCE_MS = 500;
export const DEFAULT_STABILITY_POLL_MS = 300;
export const DEFAULT_STABILITY_MAX_WAIT_MS = 30_000;
export const DEFAULT_WATCH_MAX_JOBS_PER_BURST = 5;
export const WATCH_RENAME_PAIR_WINDOW_MS = 10_000;

export const WATCH_POLICY_META_KEYS = {
  autoRunEnabled: 'watch.auto_run_enabled',
  quietHoursEnabled: 'watch.quiet_hours_enabled',
  quietHoursStart: 'watch.quiet_hours_start',
  quietHoursEnd: 'watch.quiet_hours_end',
  maxJobsPerBurst: 'watch.max_jobs_per_burst',
} as const;
export const FOLDER_PREVIEW_SESSION_TTL_MS = 60 * 60 * 1000;

export const CHAPTER_SOURCE_STATUS_LABELS: Record<ChapterSourceStatus, string> = {
  NO_SOURCE: 'Chưa có nguồn',
  SOURCE_READY: 'Có nguồn',
  SOURCE_MODIFIED: 'Đã thay đổi',
  SOURCE_MISSING: 'Không tìm thấy file',
  SOURCE_CONFLICT: 'Xung đột',
  SOURCE_ERROR: 'Không thể đọc',
};
