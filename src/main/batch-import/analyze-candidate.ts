import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BATCH_IMPORT_LANGUAGE_CONFIDENCE_MIN,
  type BatchImportFormat,
  type BatchImportWarningCode,
} from '@shared/constants/batch-import';
import type { BatchImportWarningDto } from '@shared/schemas/batch-import';
import { detectChapters } from '../import/chapter-detector';
import { detectFormat, parseImportFile } from '../import/parsers';
import { normalizeNovelText } from '../import/paragraphs/normalize';
import { detectLanguageHeuristic } from '../language/language-detect';
import { scanSourceFolder } from '../source-folder/folder-scanner';
import {
  fingerprintFromContentHashes,
  fingerprintFromNormalizedText,
} from './content-fingerprint';
import type { DiscoveredCandidate } from './discover-candidates';

export interface AnalyzedCandidate {
  kind: 'folder' | 'file';
  format: BatchImportFormat;
  absolutePath: string;
  label: string;
  predictedTitle: string;
  fileCount: number;
  chapterCount: number;
  approximateCharCount: number;
  languageCode: string | null;
  languageConfidence: number | null;
  contentFingerprint: string;
  warnings: BatchImportWarningDto[];
}

function warn(code: BatchImportWarningCode, message: string): BatchImportWarningDto {
  return { code, message };
}

function titleFromLabel(label: string): string {
  const stem = label.replace(/\.(txt|text|epub|docx)$/i, '').trim();
  return stem.length > 0 ? stem : label;
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

async function analyzeFolderCandidate(
  absolutePath: string,
  label: string,
  signal?: AbortSignal,
): Promise<AnalyzedCandidate> {
  const warnings: BatchImportWarningDto[] = [];
  const scan = await scanSourceFolder({
    folderPath: absolutePath,
    signal,
  });

  const chapterCount = scan.normalChapterCount + scan.specialChapterCount;
  const contentHashes = [
    ...scan.newChapters.map((c) => c.contentHash),
    ...scan.specialChapters.map((c) => c.contentHash),
  ].filter(Boolean);

  let approximateCharCount = 0;
  // Approximate from chapter file sizes when content wasn't returned
  try {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (!lower.endsWith('.txt') && !lower.endsWith('.text')) continue;
      const st = await fs.stat(path.join(absolutePath, entry.name));
      approximateCharCount += st.size;
    }
  } catch {
    approximateCharCount = 0;
  }

  if (scan.filesTotal === 0 || chapterCount === 0) {
    warnings.push(warn('EMPTY_FOLDER', 'Folder has no recognizable chapter files'));
    warnings.push(warn('NO_CHAPTERS', 'No chapters detected'));
  }
  if (scan.conflicts.length > 0 || scan.missingSequenceGaps.length > 0) {
    warnings.push(
      warn('UNCLEAR_CHAPTER_STRUCTURE', 'Chapter numbering conflicts or gaps detected'),
    );
  }
  if (scan.errors.length > 0) {
    warnings.push(
      warn('CORRUPT_OR_UNREADABLE', `${scan.errors.length} file(s) failed to read`),
    );
  }
  if (scan.duplicateChapters.length > 0) {
    warnings.push(warn('DUPLICATE_CONTENT', 'Duplicate chapter content inside folder'));
  }

  const parsedMeta = scan.bookMetadata?.parsed;
  const metaTitle = firstNonEmpty(
    parsedMeta?.sourceTitle,
    parsedMeta?.titleOriginal,
    parsedMeta?.titleCn,
    parsedMeta?.targetTitle,
  );

  let languageCode: string | null = null;
  let languageConfidence: number | null = null;
  const sampleBits: string[] = [];
  if (metaTitle) sampleBits.push(metaTitle);
  for (const ch of scan.newChapters.slice(0, 3)) {
    sampleBits.push(ch.chapterTitle);
  }
  const sample = sampleBits.join('\n');
  if (sample.trim().length >= 20) {
    const heuristic = detectLanguageHeuristic(sample);
    if (
      heuristic.languageSpecific &&
      heuristic.confidence >= BATCH_IMPORT_LANGUAGE_CONFIDENCE_MIN
    ) {
      languageCode = heuristic.code;
      languageConfidence = heuristic.confidence;
    }
  }

  const predictedTitle = metaTitle ?? titleFromLabel(label);

  const fingerprint =
    contentHashes.length > 0
      ? fingerprintFromContentHashes(contentHashes)
      : fingerprintFromNormalizedText(`${absolutePath}:${scan.filesTotal}`);

  return {
    kind: 'folder',
    format: 'folder_txt',
    absolutePath,
    label,
    predictedTitle,
    fileCount: scan.filesTotal,
    chapterCount,
    approximateCharCount,
    languageCode,
    languageConfidence,
    contentFingerprint: fingerprint,
    warnings,
  };
}

async function analyzeFileCandidate(
  absolutePath: string,
  label: string,
): Promise<AnalyzedCandidate> {
  const warnings: BatchImportWarningDto[] = [];
  let format: BatchImportFormat;
  try {
    format = detectFormat(absolutePath);
  } catch {
    return {
      kind: 'file',
      format: 'txt',
      absolutePath,
      label,
      predictedTitle: titleFromLabel(label),
      fileCount: 1,
      chapterCount: 0,
      approximateCharCount: 0,
      languageCode: null,
      languageConfidence: null,
      contentFingerprint: fingerprintFromNormalizedText(absolutePath),
      warnings: [warn('CORRUPT_OR_UNREADABLE', 'Unsupported or unreadable file')],
    };
  }

  try {
    const parsed = await parseImportFile(absolutePath);
    const normalized = normalizeNovelText(parsed.text);
    if (!normalized.trim()) {
      warnings.push(warn('EMPTY_FILE', 'File is empty after decoding'));
      warnings.push(warn('NO_CHAPTERS', 'No chapters detected'));
    }
    if (
      parsed.format === 'txt' &&
      parsed.encodingConfidence != null &&
      parsed.encodingConfidence < 0.55
    ) {
      warnings.push(
        warn(
          'ENCODING_UNCERTAIN',
          `Encoding detection uncertain (${parsed.encoding ?? 'unknown'})`,
        ),
      );
    }

    const detection = detectChapters(normalized);
    if (detection.warnings.length > 0 || detection.overallConfidence < 0.45) {
      warnings.push(
        warn('UNCLEAR_CHAPTER_STRUCTURE', 'Chapter structure is unclear or low confidence'),
      );
    }
    if (detection.chapters.length === 0 && normalized.trim()) {
      // Treat whole file as one implicit chapter for metrics
    }

    const chapterCount =
      detection.chapters.length > 0 ? detection.chapters.length : normalized.trim() ? 1 : 0;
    if (chapterCount === 0) {
      warnings.push(warn('NO_CHAPTERS', 'No chapters detected'));
    }

    let languageCode: string | null = null;
    let languageConfidence: number | null = null;
    const sample = normalized.slice(0, 4000);
    if (sample.trim().length >= 40) {
      const heuristic = detectLanguageHeuristic(sample);
      if (
        heuristic.languageSpecific &&
        heuristic.confidence >= BATCH_IMPORT_LANGUAGE_CONFIDENCE_MIN
      ) {
        languageCode = heuristic.code;
        languageConfidence = heuristic.confidence;
      }
    }

    return {
      kind: 'file',
      format,
      absolutePath,
      label,
      predictedTitle: titleFromLabel(label),
      fileCount: 1,
      chapterCount,
      approximateCharCount: normalized.length,
      languageCode,
      languageConfidence,
      contentFingerprint: fingerprintFromNormalizedText(normalized || absolutePath),
      warnings,
    };
  } catch (error) {
    return {
      kind: 'file',
      format,
      absolutePath,
      label,
      predictedTitle: titleFromLabel(label),
      fileCount: 1,
      chapterCount: 0,
      approximateCharCount: 0,
      languageCode: null,
      languageConfidence: null,
      contentFingerprint: fingerprintFromNormalizedText(absolutePath),
      warnings: [
        warn(
          'CORRUPT_OR_UNREADABLE',
          error instanceof Error ? error.message : 'Failed to parse file',
        ),
      ],
    };
  }
}

export async function analyzeDiscoveredCandidate(
  candidate: DiscoveredCandidate,
  signal?: AbortSignal,
): Promise<AnalyzedCandidate> {
  if (signal?.aborted) {
    throw new Error('Scan cancelled');
  }
  if (candidate.kind === 'folder') {
    return analyzeFolderCandidate(candidate.absolutePath, candidate.label, signal);
  }
  return analyzeFileCandidate(candidate.absolutePath, candidate.label);
}
