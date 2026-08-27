import path from 'node:path';
import { detectAndDecode } from '../import/encoding';
import {
  detectFilenameWithAdapters,
  detectHeadingWithAdapters,
  getTextLanguageAdapter,
} from '../language/text-adapters';
import { sha256Text } from '../import/hash';
import type { DetectedChapterFileDto } from '@shared/schemas/source-folder';

export interface FileStatInfo {
  size: number;
  mtimeMs: number;
}

export interface DetectChapterFileInput {
  filePath: string;
  buffer: Buffer;
  stat: FileStatInfo;
  /** When known, selects TextLanguageAdapter for heading / encoding. */
  sourceLanguage?: string | null;
}

export interface FilenameDetection {
  chapterNumber?: number;
  chapterTitle: string;
  confidence: number;
}

const LOW_CONFIDENCE_THRESHOLD = 0.75;

export function computeFileFingerprint(size: number, mtimeMs: number): string {
  return `${size}:${Math.floor(mtimeMs)}`;
}

export function detectChapterFromFilename(
  fileName: string,
  sourceLanguage?: string | null,
): FilenameDetection | null {
  const hit = detectFilenameWithAdapters(fileName, sourceLanguage);
  if (!hit) return null;
  return {
    chapterNumber: hit.chapterNumber,
    chapterTitle: hit.chapterTitle,
    confidence: hit.confidence,
  };
}

export function detectChapterFromHeading(
  text: string,
  sourceLanguage?: string | null,
): FilenameDetection | null {
  const adapter = sourceLanguage
    ? getTextLanguageAdapter(sourceLanguage)
    : null;
  const lines = (adapter?.normalizeText(text) ?? text).split('\n').slice(0, 20);
  for (const line of lines) {
    const hit = detectHeadingWithAdapters(line, sourceLanguage);
    if (hit?.ordinal && hit.ordinal > 0) {
      return {
        chapterNumber: hit.ordinal,
        chapterTitle: hit.title.trim(),
        confidence: hit.confidence,
      };
    }
  }
  return null;
}

export function detectChapterFile(input: DetectChapterFileInput): DetectedChapterFileDto {
  const fileName = path.basename(input.filePath);
  const fileModifiedAt = new Date(input.stat.mtimeMs).toISOString();
  const sourceFileHash = computeFileFingerprint(input.stat.size, input.stat.mtimeMs);
  const sourceLanguage = input.sourceLanguage ?? null;

  let decodeResult;
  try {
    decodeResult = detectAndDecode(input.buffer, { sourceLanguage });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đọc file chương.';
    return {
      chapterNumber: 0,
      chapterTitle: fileName,
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash: '',
      encoding: 'unknown',
      confidence: 0,
      detectionSource: 'conflict',
      normalizedText: '',
      readError: message,
    };
  }

  if (decodeResult.encoding === 'unknown' && decodeResult.confidence < 0.3) {
    return {
      chapterNumber: 0,
      chapterTitle: fileName,
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash: '',
      encoding: decodeResult.encoding,
      confidence: 0,
      detectionSource: 'conflict',
      normalizedText: '',
      readError: 'Không thể đọc file chương.',
    };
  }

  const adapter = getTextLanguageAdapter(sourceLanguage);
  const normalizedText = adapter.normalizeText(decodeResult.text);
  const contentHash = sha256Text(normalizedText);
  const fromFilename = detectChapterFromFilename(fileName, sourceLanguage);
  const fromHeading = detectChapterFromHeading(decodeResult.text, sourceLanguage);

  if (
    fromFilename?.chapterNumber &&
    fromHeading?.chapterNumber &&
    fromFilename.chapterNumber !== fromHeading.chapterNumber
  ) {
    return {
      chapterNumber: fromFilename.chapterNumber,
      chapterTitle: fromFilename.chapterTitle,
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      confidence: Math.min(fromFilename.confidence, fromHeading.confidence),
      detectionSource: 'conflict',
      normalizedText,
      readError: `Xung đột: tên file chương ${fromFilename.chapterNumber}, tiêu đề chương ${fromHeading.chapterNumber}`,
    };
  }

  const chosen = fromFilename ?? fromHeading;
  if (!chosen?.chapterNumber) {
    return {
      chapterNumber: 0,
      chapterTitle: fileName,
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      confidence: 0,
      detectionSource: 'conflict',
      normalizedText,
      readError: 'Không nhận diện được số chương.',
    };
  }

  if (chosen.confidence < LOW_CONFIDENCE_THRESHOLD && !fromFilename) {
    return {
      chapterNumber: chosen.chapterNumber,
      chapterTitle: chosen.chapterTitle,
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      confidence: chosen.confidence,
      detectionSource: 'conflict',
      normalizedText,
      readError: 'Độ tin cậy nhận diện chương thấp.',
    };
  }

  return {
    chapterNumber: chosen.chapterNumber,
    chapterTitle: chosen.chapterTitle,
    sourceFilePath: input.filePath,
    sourceFileName: fileName,
    sourceFileSize: input.stat.size,
    fileModifiedAt,
    sourceFileHash,
    contentHash,
    encoding: decodeResult.encoding,
    confidence: chosen.confidence,
    detectionSource: fromFilename ? 'filename' : 'heading',
    normalizedText,
  };
}
