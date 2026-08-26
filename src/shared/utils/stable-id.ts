/** Stable paragraph addressing — immutable once assigned; independent of title. */

const CHAPTER_PAD = 6;
const PARAGRAPH_PAD = 6;

export type ParagraphChapterRef =
  | { kind: 'number'; chapterNumber: number }
  | { kind: 'special'; token: 'PROLOGUE' | 'EPILOGUE' | 'EXTRA' | 'SPECIAL' };

export function formatChapterId(chapterNumber: number): string {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw new Error(`Invalid chapter number: ${chapterNumber}`);
  }
  return `C${String(chapterNumber).padStart(CHAPTER_PAD, '0')}`;
}

export function formatSpecialChapterToken(
  token: 'PROLOGUE' | 'EPILOGUE' | 'EXTRA' | 'SPECIAL',
): string {
  return token;
}

export function formatParagraphId(chapterNumber: number, paragraphSequence: number): string {
  if (!Number.isInteger(paragraphSequence) || paragraphSequence < 1) {
    throw new Error(`Invalid paragraph sequence: ${paragraphSequence}`);
  }
  return `[${formatChapterId(chapterNumber)}:P${String(paragraphSequence).padStart(PARAGRAPH_PAD, '0')}]`;
}

export function formatSpecialParagraphId(
  token: 'PROLOGUE' | 'EPILOGUE' | 'EXTRA' | 'SPECIAL',
  paragraphSequence: number,
): string {
  if (!Number.isInteger(paragraphSequence) || paragraphSequence < 1) {
    throw new Error(`Invalid paragraph sequence: ${paragraphSequence}`);
  }
  return `[${token}:P${String(paragraphSequence).padStart(PARAGRAPH_PAD, '0')}]`;
}

export function formatParagraphIdForChapter(
  ref: ParagraphChapterRef,
  paragraphSequence: number,
): string {
  if (ref.kind === 'number') {
    return formatParagraphId(ref.chapterNumber, paragraphSequence);
  }
  return formatSpecialParagraphId(ref.token, paragraphSequence);
}

const STABLE_ID_RE = /^\[(C\d{6}|PROLOGUE|EPILOGUE|EXTRA|SPECIAL):(P\d{6})\]$/;

export function parseStableParagraphId(
  id: string,
): { chapterId: string; paragraphToken: string; chapterNumber: number | null; paragraphSequence: number } | null {
  const match = STABLE_ID_RE.exec(id);
  if (!match) {
    return null;
  }
  const chapterToken = match[1];
  const chapterNumber =
    chapterToken.startsWith('C') ? Number.parseInt(chapterToken.slice(1), 10) : null;
  return {
    chapterId: chapterToken,
    paragraphToken: match[2],
    chapterNumber,
    paragraphSequence: Number.parseInt(match[2].slice(1), 10),
  };
}
