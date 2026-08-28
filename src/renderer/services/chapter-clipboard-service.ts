import {
  buildChapterPlainText,
  chapterHasTranslatableContent,
  type ChapterCopyMode,
  type ChapterParagraphInput,
} from '@shared/utils/chapter-export-text';

export interface ChapterClipboardInput {
  chapterNumber: number;
  title: string | null | undefined;
  paragraphs: ChapterParagraphInput[];
  mode?: ChapterCopyMode;
}

/** Electron-safe clipboard write via renderer navigator API. */
export async function writeClipboardText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function formatChapterForClipboard(input: ChapterClipboardInput): string {
  const mode = input.mode ?? 'translation';
  return buildChapterPlainText(
    input.chapterNumber,
    input.title,
    input.paragraphs,
    mode,
    { includeTitle: true },
  );
}

export function canCopyChapter(input: ChapterClipboardInput): boolean {
  const mode = input.mode ?? 'translation';
  if (mode === 'source') {
    return input.paragraphs.some((p) => p.sourceText.trim().length > 0);
  }
  if (mode === 'bilingual') {
    return input.paragraphs.some(
      (p) => p.sourceText.trim().length > 0 || (p.draftText ?? p.translatedText ?? '').trim(),
    );
  }
  return chapterHasTranslatableContent(input.paragraphs);
}

export async function copyChapterToClipboard(input: ChapterClipboardInput): Promise<void> {
  const text = formatChapterForClipboard(input);
  if (!text.trim()) {
    throw new Error('EMPTY_CHAPTER');
  }
  await writeClipboardText(text);
}
