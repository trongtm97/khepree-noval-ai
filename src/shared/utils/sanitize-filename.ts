const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/** Windows MAX_PATH-ish leaf budget; keep room for dir + extension. */
export const MAX_FILENAME_LEAF = 120;

function stripTrailingDotSpace(name: string): string {
  return name.replace(/[. ]+$/g, '');
}

function avoidReservedWindowsName(name: string): string {
  const base = name.split('.')[0]?.toUpperCase() ?? name;
  if (WINDOWS_RESERVED_NAMES.has(base)) {
    return `_${name}`;
  }
  return name;
}

/**
 * Strip characters invalid on Windows filenames.
 * Keeps Unicode letters; collapses control chars and reserved punctuation.
 */
export function sanitizeFilename(name: string, maxLength = 80): string {
  const cleaned = stripTrailingDotSpace(
    name
      .normalize('NFC')
      .replace(INVALID_FILENAME_CHARS, '_')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  const safe = avoidReservedWindowsName(cleaned.slice(0, maxLength) || 'untitled');
  return stripTrailingDotSpace(safe) || 'untitled';
}

/** Default single-chapter export filename: `0451 - Title.txt`. */
export function buildChapterExportFilename(
  chapterNumber: number,
  title: string | null | undefined,
  ext: string,
  padLength = 4,
): string {
  const num = String(chapterNumber).padStart(padLength, '0');
  const safeTitle = sanitizeFilename(title ?? '');
  const base = safeTitle ? `${num} - ${safeTitle}` : num;
  return `${base}.${ext}`;
}

/** Multi-chapter range export filename: `chapters-0001-0100.txt`. */
export function buildChapterRangeExportFilename(
  chapterFrom: number,
  chapterTo: number,
  ext: string,
  padLength = 4,
): string {
  const from = String(chapterFrom).padStart(padLength, '0');
  const to = String(chapterTo).padStart(padLength, '0');
  return `chapters-${from}-${to}.${ext}`;
}

/** Full-novel export filename: `Project Title.txt`. */
export function buildNovelExportFilename(
  projectTitle: string,
  ext: string,
): string {
  const safeTitle = sanitizeFilename(projectTitle || 'novel', MAX_FILENAME_LEAF - ext.length - 1);
  return `${safeTitle}.${ext}`;
}

/**
 * Split base + extension; append ` (2)`, ` (3)`… before extension for collisions.
 * Does not check disk — caller decides uniqueness.
 */
export function versionedFilename(fileName: string, version: number): string {
  if (version <= 1) return fileName;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return `${fileName} (${version})`;
  const base = fileName.slice(0, dot);
  const ext = fileName.slice(dot);
  return `${base} (${version})${ext}`;
}

/**
 * Ensure absolute path length stays under a practical Windows budget by
 * shortening the leaf name when needed (keeps extension).
 */
export function fitPathLength(
  directory: string,
  fileName: string,
  maxAbsolute = 240,
): string {
  const sep = directory.includes('\\') ? '\\' : '/';
  const joined = `${directory.replace(/[\\/]+$/, '')}${sep}${fileName}`;
  if (joined.length <= maxAbsolute) return fileName;

  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot) : '';
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const overhead = joined.length - fileName.length;
  const budget = Math.max(16, maxAbsolute - overhead - ext.length);
  const shortBase = sanitizeFilename(base, budget);
  return `${shortBase}${ext}`;
}
