import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChapterType } from '@shared/constants/book-metadata';
import type { FolderScanResultDto } from '@shared/schemas/source-folder';
import type { ChapterRow } from '../db/repositories/chapter-repository';
import {
  assignSequenceOrders,
  classifySourceFile,
  type ClassifiedSourceFile,
} from './source-file-classifier';
import type { DetectedChapterFileDto } from '@shared/schemas/source-folder';

export interface DbChapterSnapshot {
  id: string;
  chapterNumber: number | null;
  sequenceOrder: number;
  chapterType: ChapterType;
  sourceFilePath: string | null;
  sourceFileHash: string | null;
  sourceContentHash: string | null;
  sourceStatus: string;
  hasTranslation: boolean;
}

export interface FolderScannerOptions {
  folderPath: string;
  existingChapters?: DbChapterSnapshot[];
  expectedStartChapter?: number | null;
  expectedEndChapter?: number | null;
  concurrency?: number;
  onProgress?: (processed: number, total: number) => void;
  signal?: AbortSignal;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = Array.from<R | undefined>({ length: items.length });
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      if (signal?.aborted) {
        throw new Error('Scan cancelled');
      }
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results as R[];
}

function toChapterEntry(
  classified: ClassifiedSourceFile & { sequenceOrder?: number },
  status: FolderScanResultDto['newChapters'][number]['status'],
  existingChapterId?: string,
  duplicateOfPath?: string,
  errorMessage?: string,
): FolderScanResultDto['newChapters'][number] {
  return {
    chapterNumber: classified.chapterNumber ?? 0,
    chapterTitle: classified.chapterTitle ?? classified.sourceFileName,
    sourceFilePath: classified.sourceFilePath,
    sourceFileName: classified.sourceFileName,
    sourceFileHash: classified.sourceFileHash,
    contentHash: classified.contentHash,
    status,
    existingChapterId,
    duplicateOfPath,
    errorMessage,
  };
}

function toDetectedFromClassified(classified: ClassifiedSourceFile): DetectedChapterFileDto {
  return {
    chapterNumber: classified.chapterNumber ?? 0,
    chapterTitle: classified.chapterTitle ?? classified.sourceFileName,
    sourceFilePath: classified.sourceFilePath,
    sourceFileName: classified.sourceFileName,
    sourceFileSize: classified.sourceFileSize,
    fileModifiedAt: classified.fileModifiedAt,
    sourceFileHash: classified.sourceFileHash,
    contentHash: classified.contentHash,
    encoding: classified.encoding,
    confidence: classified.confidence,
    detectionSource: classified.detectionSource === 'content' ? 'heading' : classified.detectionSource,
    normalizedText: classified.normalizedText,
    readError: classified.readError,
  };
}

function isChapterLike(classification: ClassifiedSourceFile['classification']): boolean {
  return ['CHAPTER', 'PROLOGUE', 'EPILOGUE', 'EXTRA'].includes(classification);
}

export async function scanSourceFolder(
  options: FolderScannerOptions,
): Promise<FolderScanResultDto> {
  const {
    folderPath,
    existingChapters = [],
    expectedStartChapter,
    expectedEndChapter,
    concurrency = 8,
    onProgress,
    signal,
  } = options;

  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const txtFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map((entry) => path.join(folderPath, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const existingByPath = new Map(
    existingChapters
      .filter((ch): ch is DbChapterSnapshot & { sourceFilePath: string } =>
        Boolean(ch.sourceFilePath),
      )
      .map((ch) => [ch.sourceFilePath, ch]),
  );
  const existingByNumber = new Map(
    existingChapters
      .filter((ch): ch is DbChapterSnapshot & { chapterNumber: number } =>
        ch.chapterNumber != null,
      )
      .map((ch) => [ch.chapterNumber, ch]),
  );

  let processed = 0;
  const classifiedRaw: ClassifiedSourceFile[] = await mapWithConcurrency(
    txtFiles,
    concurrency,
    async (filePath): Promise<ClassifiedSourceFile> => {
      if (signal?.aborted) throw new Error('Scan cancelled');
      const stat = await fs.stat(filePath);
      const fingerprint = `${stat.size}:${Math.floor(stat.mtimeMs)}`;
      const existingForPath = existingByPath.get(filePath);
      if (existingForPath?.sourceFileHash && existingForPath.sourceFileHash === fingerprint) {
        processed += 1;
        onProgress?.(processed, txtFiles.length);
        return {
          sourceFilePath: filePath,
          sourceFileName: path.basename(filePath),
          sourceFileSize: stat.size,
          fileModifiedAt: new Date(stat.mtimeMs).toISOString(),
          sourceFileHash: fingerprint,
          contentHash: existingForPath.sourceContentHash ?? '',
          encoding: 'utf-8',
          normalizedText: '',
          classification:
            existingForPath.chapterType === 'PROLOGUE'
              ? 'PROLOGUE'
              : existingForPath.chapterType === 'EPILOGUE'
                ? 'EPILOGUE'
                : existingForPath.chapterType === 'EXTRA'
                  ? 'EXTRA'
                  : 'CHAPTER',
          chapterType: existingForPath.chapterType,
          chapterNumber: existingForPath.chapterNumber,
          chapterTitle: path.basename(filePath, path.extname(filePath)),
          confidence: 1,
          detectionSource: 'filename',
          sequenceOrder: existingForPath.sequenceOrder,
        } as ClassifiedSourceFile & { sequenceOrder: number; skippedRead?: boolean };
      }

      const buffer = await fs.readFile(filePath);
      const classified = classifySourceFile({ filePath, buffer, stat });
      processed += 1;
      onProgress?.(processed, txtFiles.length);
      return classified;
    },
    signal,
  );

  const withSequence = assignSequenceOrders(classifiedRaw);

  const result: FolderScanResultDto = {
    filesTotal: txtFiles.length,
    recognizedFiles: 0,
    newChapters: [],
    existingUnchanged: [],
    modifiedChapters: [],
    missingChapters: [],
    duplicateChapters: [],
    conflicts: [],
    unrecognizedFiles: [],
    errors: [],
    missingSequenceGaps: [],
    chapterRange: null,
    bookMetadata: null,
    projectDocuments: [],
    specialChapters: [],
    classifiedFiles: [],
    normalChapterCount: 0,
    specialChapterCount: 0,
    documentCount: 0,
  };

  const detectedByNumber = new Map<number, ClassifiedSourceFile[]>();

  for (const classified of withSequence) {
    const seq = (classified as ClassifiedSourceFile & { sequenceOrder?: number }).sequenceOrder;

    result.classifiedFiles.push({
      sourceFilePath: classified.sourceFilePath,
      sourceFileName: classified.sourceFileName,
      classification: classified.classification,
      documentType: classified.documentType,
      chapterType: classified.chapterType,
      chapterNumber: classified.chapterNumber,
      sequenceOrder: seq,
      displayTitle: classified.displayTitle,
      confidence: classified.confidence,
      readError: classified.readError,
    });

    if (classified.classification === 'BOOK_METADATA' && classified.parsedMetadata) {
      result.bookMetadata = {
        sourceFilePath: classified.sourceFilePath,
        sourceFileName: classified.sourceFileName,
        parsed: classified.parsedMetadata,
      };
      result.documentCount += 1;
      continue;
    }

    if (classified.classification === 'PROJECT_DOCUMENT') {
      const existingDoc = existingByPath.get(classified.sourceFilePath);
      result.projectDocuments.push({
        sourceFilePath: classified.sourceFilePath,
        sourceFileName: classified.sourceFileName,
        documentType: classified.documentType ?? 'OTHER',
        classification: classified.classification,
        contentHash: classified.contentHash,
        status: existingDoc ? 'unchanged' : 'new',
      });
      result.documentCount += 1;
      continue;
    }

    if (classified.classification === 'UNKNOWN') {
      result.unrecognizedFiles.push(classified.sourceFilePath);
      if (classified.readError) {
        result.errors.push({
          sourceFilePath: classified.sourceFilePath,
          message: classified.readError,
        });
      }
      continue;
    }

    if (!isChapterLike(classified.classification)) continue;

    if (classified.classification !== 'CHAPTER') {
      result.specialChapterCount += 1;
      const existing = existingByPath.get(classified.sourceFilePath);
      result.specialChapters.push({
        sourceFilePath: classified.sourceFilePath,
        sourceFileName: classified.sourceFileName,
        chapterType: classified.chapterType ?? 'SPECIAL',
        sequenceOrder: seq ?? 0,
        chapterNumber: classified.chapterNumber,
        chapterTitle: classified.chapterTitle ?? classified.sourceFileName,
        displayTitle: classified.displayTitle ?? classified.chapterTitle ?? classified.sourceFileName,
        contentHash: classified.contentHash,
        status: existing ? 'unchanged' : 'new',
        existingChapterId: existing?.id,
        errorMessage: classified.readError,
      });
      result.recognizedFiles += 1;
      continue;
    }

    if (classified.detectionSource === 'conflict' && classified.conflictDetail) {
      const num = classified.chapterNumber ?? 0;
      if (num > 0) {
        const list = detectedByNumber.get(num) ?? [];
        list.push(classified);
        detectedByNumber.set(num, list);
        result.conflicts.push({
          chapterNumber: num,
          files: [toDetectedFromClassified(classified)],
        });
      } else {
        result.unrecognizedFiles.push(classified.sourceFilePath);
        result.errors.push({
          sourceFilePath: classified.sourceFilePath,
          message: classified.conflictDetail,
        });
      }
      continue;
    }

    const chapterNumber = classified.chapterNumber;
    if (!chapterNumber || chapterNumber <= 0) {
      result.unrecognizedFiles.push(classified.sourceFilePath);
      if (classified.readError) {
        result.errors.push({
          sourceFilePath: classified.sourceFilePath,
          message: classified.readError,
        });
      }
      continue;
    }

    result.normalChapterCount += 1;
    result.recognizedFiles += 1;
    const list = detectedByNumber.get(chapterNumber) ?? [];
    list.push(classified);
    detectedByNumber.set(chapterNumber, list);
  }

  for (const [chapterNumber, files] of detectedByNumber) {
    if (files.length > 1) {
      const hashes = new Set(files.map((f) => f.contentHash));
      const canonical = files[0];
      const existing = existingByNumber.get(chapterNumber);
      if (hashes.size === 1) {
        classifyChapterFile(canonical, existing, result, 'duplicate', files.slice(1).map((f) => f.sourceFilePath));
        result.duplicateChapters.push({
          chapterNumber,
          files: files.map((f) => ({
            sourceFilePath: f.sourceFilePath,
            contentHash: f.contentHash,
          })),
        });
      } else {
        result.conflicts.push({
          chapterNumber,
          files: files.map(toDetectedFromClassified),
        });
        result.duplicateChapters.push({
          chapterNumber,
          files: files.map((f) => ({
            sourceFilePath: f.sourceFilePath,
            contentHash: f.contentHash,
          })),
        });
      }
      continue;
    }

    classifyChapterFile(files[0], existingByNumber.get(chapterNumber), result);
  }

  const seenPaths = new Set(withSequence.map((f) => f.sourceFilePath));
  for (const existing of existingChapters) {
    if (existing.sourceFilePath && !seenPaths.has(existing.sourceFilePath)) {
      result.missingChapters.push({
        chapterNumber: existing.chapterNumber ?? existing.sequenceOrder,
        chapterId: existing.id,
        sourceFilePath: existing.sourceFilePath,
      });
    }
  }

  const recognizedNumbers = [...detectedByNumber.keys()].sort((a, b) => a - b);
  if (recognizedNumbers.length > 0) {
    const min = expectedStartChapter ?? recognizedNumbers[0];
    const max = expectedEndChapter ?? recognizedNumbers[recognizedNumbers.length - 1];
    result.chapterRange = { min, max };
    const present = new Set(recognizedNumbers);
    for (let n = min; n <= max; n += 1) {
      if (!present.has(n) && !existingByNumber.has(n)) {
        result.missingSequenceGaps.push(n);
      }
    }
  }

  return result;
}

function classifyChapterFile(
  classified: ClassifiedSourceFile,
  existing: DbChapterSnapshot | undefined,
  result: FolderScanResultDto,
  forceStatus?: 'duplicate',
  duplicatePaths?: string[],
): void {
  const entry = toChapterEntry(classified, forceStatus ?? 'new', existing?.id, duplicatePaths?.[0]);

  if (!existing) {
    result.newChapters.push(entry);
    return;
  }

  if (
    existing.sourceContentHash &&
    existing.sourceContentHash === classified.contentHash &&
    existing.sourceFileHash === classified.sourceFileHash
  ) {
    result.existingUnchanged.push(toChapterEntry(classified, 'unchanged', existing.id));
    return;
  }

  if (existing.sourceContentHash && existing.sourceContentHash !== classified.contentHash) {
    result.modifiedChapters.push(toChapterEntry(classified, 'modified', existing.id));
    return;
  }

  result.newChapters.push(
    toChapterEntry(classified, forceStatus ?? 'new', existing.id, duplicatePaths?.[0]),
  );
}

export function chapterRowToSnapshot(
  row: ChapterRow,
  hasTranslation: boolean,
): DbChapterSnapshot {
  return {
    id: row.id,
    chapterNumber: row.chapter_number,
    sequenceOrder: row.sequence_order,
    chapterType: row.chapter_type,
    sourceFilePath: row.source_file_path,
    sourceFileHash: row.source_file_hash,
    sourceContentHash: row.source_content_hash,
    sourceStatus: row.source_status,
    hasTranslation,
  };
}
