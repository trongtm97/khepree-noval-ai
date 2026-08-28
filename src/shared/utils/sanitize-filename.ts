const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

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

/** Strip characters invalid on Windows filenames. */
export function sanitizeFilename(name: string, maxLength = 80): string {
  const cleaned = stripTrailingDotSpace(
    name.replace(INVALID_FILENAME_CHARS, '_').replace(/\s+/g, ' ').trim(),
  );
  return avoidReservedWindowsName(cleaned.slice(0, maxLength));
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
  const safeTitle = sanitizeFilename(projectTitle || 'novel');
  return `${safeTitle}.${ext}`;
}
