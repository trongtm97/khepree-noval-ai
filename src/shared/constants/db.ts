/** AppData subdirectory: %APPDATA%/NovelTrans/ */
export const NOVELTRANS_APPDATA_DIR = 'NovelTrans' as const;

export const DB_FILENAME = 'noveltrans.db' as const;

/** @deprecated use @shared/constants/term */
export {
  TERM_SCOPES,
  TERM_STATUSES,
  TERM_TYPES,
  type TermScope,
  type TermStatus,
  type TermType,
} from './term';

