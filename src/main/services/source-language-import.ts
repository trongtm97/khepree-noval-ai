import fsSync from 'node:fs';
import type { FolderScanResultDto } from '@shared/schemas/source-folder';
import type { SourceLanguageMode } from '@shared/constants/source-language';
import { DEFAULT_TARGET_LANGUAGE, normalizeLanguageCode } from '@shared/constants/language-profile';
import { buildLanguageDetectionSample } from '../language/build-language-detection-sample';
import { detectSourceLanguage } from '../language/language-detect';
import type { AiLanguageDetectFn } from '../language/ai-language-detect';
import type { SourceLanguageDetection } from '@shared/schemas/source-language';
import { utcNow } from '../db/utils/timestamps';

export interface ResolveImportSourceLanguageInput {
  scanResult: FolderScanResultDto;
  folderPath: string;
  sourceLanguageHint?: string | null;
  sourceLanguageMode?: SourceLanguageMode;
  aiDetect?: AiLanguageDetectFn;
}

export interface ResolvedImportSourceLanguage {
  detection: SourceLanguageDetection;
  sourceLanguageMode: SourceLanguageMode;
  sourceLanguageHint: string | null;
}

export async function resolveImportSourceLanguage(
  input: ResolveImportSourceLanguageInput,
): Promise<ResolvedImportSourceLanguage> {
  const importable = input.scanResult.newChapters.filter(
    (ch) => ch.status === 'new' && ch.chapterNumber > 0,
  );

  const prologue = input.scanResult.newChapters.find((ch) => ch.chapterNumber <= 0);

  const sampleText = buildLanguageDetectionSample({
    bookMetadataText: input.scanResult.bookMetadata?.parsed
      ? [
          input.scanResult.bookMetadata.parsed.sourceTitle,
          input.scanResult.bookMetadata.parsed.titleCn,
          input.scanResult.bookMetadata.parsed.introduction,
          input.scanResult.bookMetadata.parsed.officialSummary,
        ]
          .filter(Boolean)
          .join('\n')
      : null,
    prologueText: prologue?.chapterTitle ?? null,
    chapters: importable.map((ch) => ({
      chapterNumber: ch.chapterNumber,
      chapterTitle: ch.chapterTitle,
      sourceFilePath: ch.sourceFilePath,
    })),
    readFile: (filePath) => {
      try {
        return fsSync.readFileSync(filePath, 'utf8');
      } catch {
        return null;
      }
    },
  });

  const hint =
    input.sourceLanguageMode === 'HINTED' && input.sourceLanguageHint
      ? normalizeLanguageCode(input.sourceLanguageHint)
      : null;

  const detection = await detectSourceLanguage({
    sampleText,
    hintCode: hint,
    aiDetect: input.aiDetect,
  });

  return {
    detection,
    sourceLanguageMode: hint ? 'HINTED' : 'AUTO',
    sourceLanguageHint: hint,
  };
}

export function assertSourceTargetDiffer(
  sourceLanguage: string,
  targetLanguage: string,
): void {
  if (normalizeLanguageCode(sourceLanguage) === normalizeLanguageCode(targetLanguage)) {
    throw new Error('SOURCE_TARGET_SAME');
  }
}

export function defaultImportTargetLanguage(raw?: string | null): string {
  return normalizeLanguageCode(raw ?? DEFAULT_TARGET_LANGUAGE);
}

export function detectionCheckedAt(): string {
  return utcNow();
}
