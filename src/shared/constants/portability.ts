/** Portable archive format version (Phase 18). */
export const PORTABILITY_FORMAT_VERSION = 1;

export const NOVEL_EXPORT_FORMATS = ['txt', 'docx', 'epub'] as const;
export type NovelExportFormat = (typeof NOVEL_EXPORT_FORMATS)[number];

export const BACKUP_KINDS = ['full', 'project'] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

/** Max schema version this app can restore. */
export const PORTABILITY_MAX_SCHEMA_VERSION = 39;

export const AUTO_BACKUP_META_KEYS = {
  enabled: 'backup.auto.enabled',
  intervalHours: 'backup.auto.intervalHours',
  /** @deprecated Use retentionDaily — kept for migration from flat count. */
  retentionCount: 'backup.auto.retentionCount',
  retentionDaily: 'backup.auto.retentionDaily',
  retentionWeekly: 'backup.auto.retentionWeekly',
  retentionMonthly: 'backup.auto.retentionMonthly',
  lastRunAt: 'backup.auto.lastRunAt',
  directory: 'backup.dir',
} as const;

export const DEFAULT_AUTO_BACKUP_INTERVAL_HOURS = 24;
/** @deprecated Use DEFAULT_RETENTION_DAILY */
export const DEFAULT_AUTO_BACKUP_RETENTION = 7;
export const DEFAULT_RETENTION_DAILY = 7;
export const DEFAULT_RETENTION_WEEKLY = 4;
export const DEFAULT_RETENTION_MONTHLY = 3;
export const DEFAULT_AUTO_BACKUP_ENABLED = true;

/** Subfolder names when user picks one storage root (Settings → Lưu trữ). */
export const STORAGE_ROOT_EXPORT_SUBDIR = 'Exports';
export const STORAGE_ROOT_BACKUP_SUBDIR = 'Backups';

export const BACKUP_ARCHIVE_EXTENSION = '.nts-backup.zip';
export const PROJECT_BACKUP_EXTENSION = '.nts-project.zip';

export const TERM_IMPORT_DUPLICATE_STRATEGIES = ['skip', 'merge', 'replace'] as const;
export type TermImportDuplicateStrategy = (typeof TERM_IMPORT_DUPLICATE_STRATEGIES)[number];
