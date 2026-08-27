import path from 'node:path';
import type {
  ChapterType,
  ProjectDocumentType,
  SourceFileClassification,
} from '@shared/constants/book-metadata';
import { detectAndDecode } from '../import/encoding';
import { getTextLanguageAdapter } from '../language/text-adapters';
import { sha256Text } from '../import/hash';
import { detectChapterFromFilename, detectChapterFromHeading, computeFileFingerprint } from './chapter-file-detector';
import { parseBookInfoText, type ParsedBookMetadata } from './book-info-parser';

export interface FileStatInfo {
  size: number;
  mtimeMs: number;
}

export interface ClassifyFileInput {
  filePath: string;
  buffer: Buffer;
  stat: FileStatInfo;
  sourceLanguage?: string | null;
}

export interface ClassifiedSourceFile {
  sourceFilePath: string;
  sourceFileName: string;
  sourceFileSize: number;
  fileModifiedAt: string;
  sourceFileHash: string;
  contentHash: string;
  encoding: string;
  normalizedText: string;
  classification: SourceFileClassification;
  documentType?: ProjectDocumentType;
  chapterType?: ChapterType;
  chapterNumber?: number | null;
  chapterTitle?: string;
  displayTitle?: string;
  confidence: number;
  detectionSource: 'filename' | 'heading' | 'content' | 'conflict';
  parsedMetadata?: ParsedBookMetadata;
  readError?: string;
  conflictDetail?: string;
}

const PROLOGUE_FILENAME_PATTERNS = [
  /^prologue$/i,
  /^000000[_\s-]*prologue$/i,
  /^序章$/u,
  /^楔子$/u,
  /^引子$/u,
  /^第零章$/u,
  /^第0章$/u,
];

const EPILOGUE_FILENAME_PATTERNS = [/^后记$/u, /^尾声$/u, /^终章$/u, /^epilogue$/i];

const EXTRA_FILENAME_PATTERNS = [/^番外/u, /^番外篇/u, /^外传/u, /^extra[_\s-]?\d+$/i];

const PREFACE_FILENAME_PATTERNS = [/^前言$/u, /^序$/u, /^序言$/u];

const DOCUMENT_FILENAME_MAP: { pattern: RegExp; type: ProjectDocumentType }[] = [
  { pattern: /^_book_info$/i, type: 'BOOK_INFO' },
  { pattern: /^_summary$/i, type: 'OFFICIAL_SUMMARY' },
  { pattern: /^_author_note$/i, type: 'AUTHOR_NOTE' },
  { pattern: /^_description$/i, type: 'BOOK_DESCRIPTION' },
  { pattern: /^_preface$/i, type: 'PREFACE' },
  { pattern: /^作品简介$/u, type: 'BOOK_DESCRIPTION' },
  { pattern: /^内容简介$/u, type: 'OFFICIAL_SUMMARY' },
  { pattern: /^作者简介$/u, type: 'AUTHOR_NOTE' },
  { pattern: /^作者的话$/u, type: 'AUTHOR_NOTE' },
];

function baseNameWithoutExt(fileName: string): string {
  return fileName.replace(/\.txt$/i, '');
}

function matchDocumentType(base: string): ProjectDocumentType | null {
  for (const { pattern, type } of DOCUMENT_FILENAME_MAP) {
    if (pattern.test(base)) return type;
  }
  if (PREFACE_FILENAME_PATTERNS.some((p) => p.test(base))) return 'PREFACE';
  return null;
}

function matchPrologue(base: string): boolean {
  return PROLOGUE_FILENAME_PATTERNS.some((p) => p.test(base));
}

function matchEpilogue(base: string): boolean {
  return EPILOGUE_FILENAME_PATTERNS.some((p) => p.test(base));
}

function matchExtra(base: string): boolean {
  return EXTRA_FILENAME_PATTERNS.some((p) => p.test(base));
}

function displayTitleForType(chapterType: ChapterType, chapterTitle: string, extraIndex?: number): string {
  switch (chapterType) {
    case 'PROLOGUE':
      return 'Chương mở đầu';
    case 'EPILOGUE':
      return chapterTitle || 'Chương kết';
    case 'EXTRA':
    case 'SIDE_STORY':
      return extraIndex ? `Ngoại truyện ${extraIndex}` : chapterTitle || 'Ngoại truyện';
    default:
      return chapterTitle;
  }
}

export function classifySourceFile(input: ClassifyFileInput): ClassifiedSourceFile {
  const fileName = path.basename(input.filePath);
  const base = baseNameWithoutExt(fileName);
  const fileModifiedAt = new Date(input.stat.mtimeMs).toISOString();
  const sourceFileHash = computeFileFingerprint(input.stat.size, input.stat.mtimeMs);

  let decodeResult;
  try {
    decodeResult = detectAndDecode(input.buffer, {
      sourceLanguage: input.sourceLanguage,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đọc file.';
    return {
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash: '',
      encoding: 'unknown',
      normalizedText: '',
      classification: 'UNKNOWN',
      confidence: 0,
      detectionSource: 'conflict',
      readError: message,
    };
  }

  const adapter = getTextLanguageAdapter(input.sourceLanguage);
  const normalizedText = adapter.normalizeText(decodeResult.text);
  const contentHash = sha256Text(normalizedText);

  if (base.startsWith('_') && /^_book_info$/i.test(base)) {
    return {
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      normalizedText,
      classification: 'BOOK_METADATA',
      documentType: 'BOOK_INFO',
      confidence: 0.99,
      detectionSource: 'filename',
      parsedMetadata: parseBookInfoText(normalizedText),
    };
  }

  if (base.startsWith('_')) {
    const docType = matchDocumentType(base) ?? 'OTHER';
    return {
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      normalizedText,
      classification: 'PROJECT_DOCUMENT',
      documentType: docType,
      confidence: 0.95,
      detectionSource: 'filename',
    };
  }

  const docByName = matchDocumentType(base);
  if (docByName && docByName !== 'BOOK_INFO') {
    return {
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      normalizedText,
      classification: 'PROJECT_DOCUMENT',
      documentType: docByName,
      confidence: 0.9,
      detectionSource: 'filename',
    };
  }

  if (matchPrologue(base)) {
    const title = base;
    return {
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      normalizedText,
      classification: 'PROLOGUE',
      chapterType: 'PROLOGUE',
      chapterNumber: null,
      chapterTitle: title,
      displayTitle: displayTitleForType('PROLOGUE', title),
      confidence: 0.92,
      detectionSource: 'filename',
    };
  }

  if (matchEpilogue(base)) {
    return {
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      normalizedText,
      classification: 'EPILOGUE',
      chapterType: 'EPILOGUE',
      chapterNumber: null,
      chapterTitle: base,
      displayTitle: displayTitleForType('EPILOGUE', base),
      confidence: 0.9,
      detectionSource: 'filename',
    };
  }

  if (matchExtra(base)) {
    const extraMatch = /(\d+)/.exec(base);
    const extraIndex = extraMatch ? Number.parseInt(extraMatch[1], 10) : undefined;
    return {
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      normalizedText,
      classification: 'EXTRA',
      chapterType: 'EXTRA',
      chapterNumber: null,
      chapterTitle: base,
      displayTitle: displayTitleForType('EXTRA', base, extraIndex),
      confidence: 0.88,
      detectionSource: 'filename',
    };
  }

  const fromFilename = detectChapterFromFilename(fileName, input.sourceLanguage);
  const fromHeading = detectChapterFromHeading(decodeResult.text, input.sourceLanguage);

  if (
    fromFilename?.chapterNumber &&
    fromHeading?.chapterNumber &&
    fromFilename.chapterNumber !== fromHeading.chapterNumber
  ) {
    return {
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      normalizedText,
      classification: 'CHAPTER',
      chapterType: 'NORMAL',
      chapterNumber: fromFilename.chapterNumber,
      chapterTitle: fromFilename.chapterTitle,
      confidence: Math.min(fromFilename.confidence, fromHeading.confidence),
      detectionSource: 'conflict',
      conflictDetail: `Xung đột: tên file chương ${fromFilename.chapterNumber}, tiêu đề chương ${fromHeading.chapterNumber}`,
      readError: `Xung đột số chương: file=${fromFilename.chapterNumber}, nội dung=${fromHeading.chapterNumber}`,
    };
  }

  const chosen = fromFilename ?? fromHeading;
  if (chosen?.chapterNumber) {
    return {
      sourceFilePath: input.filePath,
      sourceFileName: fileName,
      sourceFileSize: input.stat.size,
      fileModifiedAt,
      sourceFileHash,
      contentHash,
      encoding: decodeResult.encoding,
      normalizedText,
      classification: 'CHAPTER',
      chapterType: 'NORMAL',
      chapterNumber: chosen.chapterNumber,
      chapterTitle: chosen.chapterTitle,
      confidence: chosen.confidence,
      detectionSource: fromFilename ? 'filename' : 'heading',
    };
  }

  return {
    sourceFilePath: input.filePath,
    sourceFileName: fileName,
    sourceFileSize: input.stat.size,
    fileModifiedAt,
    sourceFileHash,
    contentHash,
    encoding: decodeResult.encoding,
    normalizedText,
    classification: 'UNKNOWN',
    confidence: 0,
    detectionSource: 'conflict',
    readError: 'Không nhận diện được loại file.',
  };
}

/** Assign sequence_order across classified chapter-like files. */
export function assignSequenceOrders(
  files: ClassifiedSourceFile[],
): ClassifiedSourceFile[] {
  const chapterLike = files.filter((f) =>
    ['PROLOGUE', 'CHAPTER', 'EPILOGUE', 'EXTRA'].includes(f.classification),
  );

  const prologues = chapterLike.filter((f) => f.classification === 'PROLOGUE');
  const normals = chapterLike
    .filter((f) => f.classification === 'CHAPTER' && f.chapterNumber)
    .sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
  const extras = chapterLike.filter((f) => f.classification === 'EXTRA');
  const epilogues = chapterLike.filter((f) => f.classification === 'EPILOGUE');

  let order = 0;
  const result = new Map<string, number>();

  for (const file of prologues) {
    result.set(file.sourceFilePath, order);
    order += 1;
  }

  for (const file of normals) {
    result.set(file.sourceFilePath, file.chapterNumber ?? order);
    order = Math.max(order, (file.chapterNumber ?? order) + 1);
  }

  for (const file of extras) {
    result.set(file.sourceFilePath, order);
    order += 1;
  }

  for (const file of epilogues) {
    result.set(file.sourceFilePath, order);
    order += 1;
  }

  return files.map((file) => {
    const seq = result.get(file.sourceFilePath);
    if (seq === undefined) return file;
    return { ...file, sequenceOrder: seq } as ClassifiedSourceFile & { sequenceOrder: number };
  });
}
