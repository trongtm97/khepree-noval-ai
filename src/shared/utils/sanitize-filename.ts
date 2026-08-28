const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** Strip characters invalid on Windows filenames. */
export function sanitizeFilename(name: string, maxLength = 80): string {
  return name.replace(INVALID_FILENAME_CHARS, '_').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Default single-chapter export filename: `0451 - Title.txt`. */
export function buildChapterExportFilename(
  chapterNumber: number,
  title: string | null | undefined,
  ext: string,
): string {
  const num = String(chapterNumber).padStart(4, '0');
  const safeTitle = sanitizeFilename(title ?? '');
  const base = safeTitle ? `${num} - ${safeTitle}` : num;
  return `${base}.${ext}`;
}
