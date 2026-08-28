import type { NovelExportFormat } from '@shared/constants/portability';
import { buildChapterExportFilename } from '@shared/utils/sanitize-filename';
import { flushEditorSaves, type FlushSaveInput } from './editor-flush-save';

export interface ExportChapterInput {
  projectId: string;
  chapterNumber: number;
  chapterTitle: string | null | undefined;
  format: Extract<NovelExportFormat, 'txt' | 'docx'>;
  flushSave: FlushSaveInput;
}

export interface ExportChapterResult {
  filePath: string;
  chapterCount: number;
  paragraphCount: number;
}

/** Flush dirty drafts, then export a single chapter via portability IPC. */
export async function exportChapter(input: ExportChapterInput): Promise<ExportChapterResult> {
  const saved = await flushEditorSaves(input.flushSave);
  if (!saved) {
    throw new Error('SAVE_BEFORE_EXPORT_FAILED');
  }

  const defaultName = buildChapterExportFilename(
    input.chapterNumber,
    input.chapterTitle,
    input.format,
  );

  const pick = await window.novelTrans.portability.selectExportPath({
    defaultName,
    format: input.format,
  });
  if (pick.canceled || !pick.filePath) {
    throw new Error('EXPORT_CANCELED');
  }

  const result = await window.novelTrans.portability.exportNovel({
    projectId: input.projectId,
    format: input.format,
    chapterFrom: input.chapterNumber,
    chapterTo: input.chapterNumber,
    translatedOnly: false,
    includeChapterTitles: true,
    includeParagraphIds: false,
    outputPath: pick.filePath,
  });

  return result;
}
