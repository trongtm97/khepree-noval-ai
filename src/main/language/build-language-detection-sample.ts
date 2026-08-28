import {
  LANGUAGE_SAMPLE_MAX_CHARS,
  LANGUAGE_SAMPLE_MIN_CHARS,
} from '@shared/constants/source-language';

export interface LanguageSampleChapter {
  chapterNumber: number;
  chapterTitle: string;
  sourceFilePath: string;
  bodyText?: string | null;
}

export interface BuildLanguageDetectionSampleInput {
  bookMetadataText?: string | null;
  prologueText?: string | null;
  chapters: LanguageSampleChapter[];
  readFile?: (filePath: string) => string | null;
}

function takeParagraphs(text: string, maxChars: number): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const chunks: string[] = [];
  let len = 0;
  for (const line of lines) {
    if (len >= maxChars) break;
    chunks.push(line);
    len += line.length + 1;
  }
  return chunks.join('\n');
}

function readChapterBody(
  chapter: LanguageSampleChapter,
  readFile?: (filePath: string) => string | null,
): string {
  if (chapter.bodyText != null) return chapter.bodyText;
  if (!readFile) return '';
  return readFile(chapter.sourceFilePath) ?? '';
}

/**
 * Build a representative language sample (3k–10k chars) from metadata + early chapters.
 * Never uses filename alone.
 */
export function buildLanguageDetectionSample(
  input: BuildLanguageDetectionSampleInput,
): string {
  const parts: string[] = [];

  if (input.bookMetadataText?.trim()) {
    parts.push(input.bookMetadataText.trim().slice(0, 1500));
  }
  if (input.prologueText?.trim()) {
    parts.push(input.prologueText.trim().slice(0, 2000));
  }

  const sorted = [...input.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const early = sorted.filter((c) => c.chapterNumber > 0).slice(0, 3);
  const mid = sorted.filter((c) => c.chapterNumber > 0).slice(3, 6);

  for (const ch of early) {
    const body = readChapterBody(ch, input.readFile);
    if (ch.chapterTitle.trim()) parts.push(ch.chapterTitle.trim());
    if (body) {
      const head = takeParagraphs(body, 1200);
      parts.push(head);
      const midStart = Math.floor(body.length / 3);
      if (body.length > 800) {
        parts.push(takeParagraphs(body.slice(midStart), 800));
      }
    }
  }

  for (const ch of mid.slice(0, 2)) {
    const body = readChapterBody(ch, input.readFile);
    if (body.length > 400) {
      const midStart = Math.floor(body.length / 2);
      parts.push(takeParagraphs(body.slice(midStart), 600));
    }
  }

  let sample = parts.join('\n\n').trim();
  if (sample.length < LANGUAGE_SAMPLE_MIN_CHARS) {
    for (const ch of sorted) {
      const body = readChapterBody(ch, input.readFile);
      if (!body) continue;
      sample = `${sample}\n\n${body}`.trim();
      if (sample.length >= LANGUAGE_SAMPLE_MIN_CHARS) break;
    }
  }

  return sample.slice(0, LANGUAGE_SAMPLE_MAX_CHARS);
}
