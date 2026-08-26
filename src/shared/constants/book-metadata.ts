/** Book metadata & source file classification constants. */

export const CHAPTER_TYPES = [
  'NORMAL',
  'PROLOGUE',
  'EPILOGUE',
  'EXTRA',
  'SIDE_STORY',
  'SPECIAL',
] as const;

export type ChapterType = (typeof CHAPTER_TYPES)[number];

export const SOURCE_FILE_CLASSIFICATIONS = [
  'BOOK_METADATA',
  'PROJECT_DOCUMENT',
  'CHAPTER',
  'PROLOGUE',
  'EPILOGUE',
  'EXTRA',
  'UNKNOWN',
] as const;

export type SourceFileClassification = (typeof SOURCE_FILE_CLASSIFICATIONS)[number];

export const PROJECT_DOCUMENT_TYPES = [
  'BOOK_INFO',
  'BOOK_DESCRIPTION',
  'OFFICIAL_SUMMARY',
  'AUTHOR_NOTE',
  'PREFACE',
  'TRANSLATION_NOTE',
  'CHARACTER_INTRO',
  'SETTING_INTRO',
  'OTHER',
] as const;

export type ProjectDocumentType = (typeof PROJECT_DOCUMENT_TYPES)[number];

export const METADATA_SOURCES = [
  'USER_EDIT',
  'PROJECT_CONFIRMED',
  'BOOK_INFO_FILE',
  'AUTO_DETECTED',
] as const;

export type MetadataSource = (typeof METADATA_SOURCES)[number];

export const PUBLICATION_STATUSES = [
  'ongoing',
  'completed',
  'paused',
  'unknown',
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const GENRE_PRESETS = [
  'Tiên hiệp',
  'Tu chân',
  'Huyền huyễn',
  'Võ hiệp',
  'Đô thị',
  'Ngôn tình',
  'Lịch sử',
  'Khoa huyễn',
  'Game',
  'Hệ thống',
  'Xuyên không',
  'Trọng sinh',
  'Mạt thế',
  'Trinh thám',
  'Kinh dị',
  'Khác',
] as const;

export type GenrePreset = (typeof GENRE_PRESETS)[number];

/** Default compact book profile character budget for TranslationPack. */
export const DEFAULT_BOOK_PROFILE_CHAR_BUDGET = 1200;
