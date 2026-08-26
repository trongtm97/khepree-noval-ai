import path from 'node:path';
import { detectAndDecode } from '../import/encoding';
import { parseChineseOrdinal, normalizeDigits } from '../import/chapter-detector/utils';
import {
  chineseChapterDetector,
  englishChapterDetector,
  prefixedChapterDetector,
} from '../import/chapter-detector/detectors';
import { normalizeNovelText } from '../import/paragraphs/normalize';
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
}

export interface FilenameDetection {
  chapterNumber?: number;
  chapterTitle: string;
  confidence: number;
}

const HEADING_DETECTORS = [prefixedChapterDetector, chineseChapterDetector, englishChapterDetector];

const LOW_CONFIDENCE_THRESHOLD = 0.75;

export function computeFileFingerprint(size: number, mtimeMs: number): string {
  return `${size}:${Math.floor(mtimeMs)}`;
}

export function detectChapterFromFilename(fileName: string): FilenameDetection | null {
  const base = fileName.replace(/\.txt$/i, '');
  const normalized = normalizeDigits(base);

  const patterns: { regex: RegExp; titleFrom?: (m: RegExpMatchArray) => string }[] = [
    { regex: /^(\d+)$/ },
    { regex: /^chuong[_\s-]*(\d+)$/i },
    { regex: /^chapter[_\s-]*(\d+)$/i },
    { regex: /^第([零〇○两一二三四五六七八九十百千0-9０-９]+)章(.*)$/u },
    { regex: /^(\d+)\s*[-–—]\s*(.+)$/ },
    { regex: /^(.+?)[_\s-]*(\d+)$/ },
  ];

  for (const { regex, titleFrom } of patterns) {
    const match = regex.exec(normalized);
    if (!match) continue;

    let chapterNumber: number | undefined;
    let chapterTitle = base;

    if (regex.source.startsWith('^(.+?)[_\\s-]*(\\d+)$')) {
      chapterNumber = Number.parseInt(match[2], 10);
      chapterTitle = match[1].trim() || base;
    } else if (regex.source.includes('第')) {
      chapterNumber = parseChineseOrdinal(match[1]);
      chapterTitle = `第${match[1].trim()}章${match[2] ? match[2].trim() : ''}`.trim();
    } else if (titleFrom) {
      chapterNumber = Number.parseInt(match[1], 10);
      chapterTitle = titleFrom(match).trim() || base;
    } else {
      chapterNumber = Number.parseInt(match[1], 10);
      if (match[2]) {
        chapterTitle = match[2].trim() || base;
      }
    }

    if (!chapterNumber || chapterNumber <= 0 || !Number.isFinite(chapterNumber)) {
      continue;
    }

    return {
      chapterNumber,
      chapterTitle,
      confidence: 0.95,
    };
  }

  return null;
}

export function detectChapterFromHeading(text: string): FilenameDetection | null {
  const lines = text.split('\n').slice(0, 20);
  let offset = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const detector of HEADING_DETECTORS) {
      const candidate = detector.detectLine(line, lineIndex, offset);
      if (candidate?.ordinal && candidate.ordinal > 0) {
        return {
          chapterNumber: candidate.ordinal,
          chapterTitle: candidate.title.trim(),
          confidence: candidate.confidence,
        };
      }
    }
    offset += line.length + 1;
  }
  return null;
}

export function detectChapterFile(input: DetectChapterFileInput): DetectedChapterFileDto {
  const fileName = path.basename(input.filePath);
  const fileModifiedAt = new Date(input.stat.mtimeMs).toISOString();
  const sourceFileHash = computeFileFingerprint(input.stat.size, input.stat.mtimeMs);

  let decodeResult;
  try {
    decodeResult = detectAndDecode(input.buffer);
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

  const normalizedText = normalizeNovelText(decodeResult.text);
  const contentHash = sha256Text(normalizedText);
  const fromFilename = detectChapterFromFilename(fileName);
  const fromHeading = detectChapterFromHeading(decodeResult.text);

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
