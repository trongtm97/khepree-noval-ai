export type ChapterCopyMode = 'translation' | 'source' | 'bilingual';

export interface ChapterParagraphInput {
  stableParagraphId: string;
  sourceText: string;
  translatedText: string | null;
  /** Unsaved editor draft — takes precedence over translatedText. */
  draftText?: string;
}

/** Prefer original chapter title; synthesize "Chương N" when missing. */
export function formatExportChapterHeading(
  chapterNumber: number,
  title: string | null | undefined,
): string {
  const trimmed = title?.trim() ?? '';
  if (!trimmed) return `Chương ${chapterNumber}`;
  if (
    /第\s*[0-9一二三四五六七八九十百千零〇两兩]+?\s*[章节回卷]/i.test(trimmed) ||
    /^(chương|chapter|chap\.?)\s*\d+/i.test(trimmed) ||
    /^chương\s+/i.test(trimmed)
  ) {
    return trimmed;
  }
  return `Chương ${chapterNumber}: ${trimmed}`;
}

function resolvedTranslation(para: ChapterParagraphInput): string {
  return (para.draftText ?? para.translatedText ?? '').trim();
}

/** True when chapter has at least one non-empty translated paragraph. */
export function chapterHasTranslatableContent(paragraphs: ChapterParagraphInput[]): boolean {
  return paragraphs.some((p) => resolvedTranslation(p).length > 0);
}

/**
 * Build chapter plain text for clipboard or preview.
 * Translation mode skips empty untranslated paragraphs.
 */
export function buildChapterPlainText(
  chapterNumber: number,
  title: string | null | undefined,
  paragraphs: ChapterParagraphInput[],
  mode: ChapterCopyMode,
  opts: { includeTitle?: boolean } = {},
): string {
  const includeTitle = opts.includeTitle ?? true;
  const lines: string[] = [];

  if (includeTitle) {
    lines.push(formatExportChapterHeading(chapterNumber, title));
    lines.push('');
  }

  for (const para of paragraphs) {
    const translation = resolvedTranslation(para);
    const source = para.sourceText.trim();

    if (mode === 'translation') {
      if (!translation) continue;
      lines.push(translation);
      lines.push('');
    } else if (mode === 'source') {
      if (!source) continue;
      lines.push(source);
      lines.push('');
    } else {
      if (!source && !translation) continue;
      if (source) lines.push(source);
      if (translation) lines.push(translation);
      lines.push('');
    }
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
}
