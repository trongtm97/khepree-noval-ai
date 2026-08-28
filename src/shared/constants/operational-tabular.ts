/** Export-only operational datasets (no import). */
export const OPERATIONAL_EXPORT_TYPES = [
  'operational_jobs',
  'operational_qa',
  'operational_activity',
  'operational_conflicts',
  'operational_workbook',
] as const;
export type OperationalExportType = (typeof OPERATIONAL_EXPORT_TYPES)[number];

export const OPERATIONAL_WORKBOOK_SHEETS = [
  'JOBS',
  'QA',
  'ACTIVITY_LOG',
  'LEARNING_CONFLICTS',
] as const;
export type OperationalWorkbookSheet = (typeof OPERATIONAL_WORKBOOK_SHEETS)[number];

export const JOBS_EXPORT_COLUMNS = [
  'job_id',
  'project',
  'edition',
  'chapters',
  'worker',
  'provider',
  'state',
  'started',
  'completed',
  'duration',
  'retry_count',
  'error',
] as const;

export const QA_EXPORT_COLUMNS = [
  'project',
  'edition',
  'chapter',
  'paragraph_id',
  'issue_type',
  'severity',
  'message',
  'resolved',
] as const;

export const ACTIVITY_LOG_EXPORT_COLUMNS = [
  'timestamp',
  'level',
  'module',
  'project',
  'job',
  'message',
] as const;

export const LEARNING_CONFLICTS_EXPORT_COLUMNS = [
  'conflict_id',
  'entity_type',
  'field',
  'old',
  'new',
  'chapter',
  'status',
] as const;

export const OPERATIONAL_EXPORT_DEFAULT_LIMIT = 5000;
