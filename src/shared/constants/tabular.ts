/** NovelTrans tabular workbook metadata format. */
export const NTS_TABULAR_FORMAT = 'NTS_TABULAR' as const;
export const TABULAR_SCHEMA_VERSION = 2;

export const TABULAR_META_SHEET = '_META';

export const TABULAR_FORMATS = ['csv', 'xlsx'] as const;
export type TabularFormat = (typeof TABULAR_FORMATS)[number];

export const TABULAR_DATA_TYPES = [
  'terms',
  'characters',
  'translations',
  'project_data',
  'source_workbook',
  'operational_jobs',
  'operational_qa',
  'operational_activity',
  'operational_conflicts',
  'operational_workbook',
] as const;
export type TabularDataType = (typeof TABULAR_DATA_TYPES)[number];

export const TABULAR_IMPORT_MODES = ['IMPORT_VALID_ONLY', 'REQUIRE_ALL_VALID'] as const;
export type TabularImportMode = (typeof TABULAR_IMPORT_MODES)[number];

export const TABULAR_ROW_STATUSES = ['valid', 'warning', 'error'] as const;
export type TabularRowStatus = (typeof TABULAR_ROW_STATUSES)[number];

/** Max rows returned in preview payload (full stats still computed). */
export const TABULAR_PREVIEW_MAX_ROWS = 500;

/** CSV export: UTF-8 BOM default ON for Excel Windows. */
export const TABULAR_CSV_UTF8_BOM_DEFAULT = true;

export const TABULAR_META_FIELDS = [
  'noveltrans_format',
  'schema_version',
  'exported_at',
  'data_type',
  'project_id',
  'edition_id',
  'source_language',
  'target_language',
] as const;
