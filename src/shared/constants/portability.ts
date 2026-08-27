/** Portable archive format version (Phase 18). */
export const PORTABILITY_FORMAT_VERSION = 1;

export const NOVEL_EXPORT_FORMATS = ['txt', 'docx', 'epub'] as const;
export type NovelExportFormat = (typeof NOVEL_EXPORT_FORMATS)[number];

export const BACKUP_KINDS = ['full', 'project'] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

/** Max schema version this app can restore. */
export const PORTABILITY_MAX_SCHEMA_VERSION = 26;

export const AUTO_BACKUP_META_KEYS = {
  enabled: 'backup.auto.enabled',
  intervalHours: 'backup.auto.intervalHours',
  retentionCount: 'backup.auto.retentionCount',
  lastRunAt: 'backup.auto.lastRunAt',
} as const;

export const DEFAULT_AUTO_BACKUP_INTERVAL_HOURS = 24;
export const DEFAULT_AUTO_BACKUP_RETENTION = 7;

export const BACKUP_ARCHIVE_EXTENSION = '.nts-backup.zip';
export const PROJECT_BACKUP_EXTENSION = '.nts-project.zip';

export const TERM_IMPORT_DUPLICATE_STRATEGIES = ['skip', 'merge', 'replace'] as const;
export type TermImportDuplicateStrategy = (typeof TERM_IMPORT_DUPLICATE_STRATEGIES)[number];
