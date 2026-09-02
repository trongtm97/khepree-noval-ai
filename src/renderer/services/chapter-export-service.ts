import type { ExportDirectoryScope } from '@shared/constants/export-settings';
import type { NovelExportFormat } from '@shared/constants/portability';
import { flushEditorSaves, type FlushSaveInput } from './editor-flush-save';

export interface ExportChapterInput {
  projectId: string;
  chapterNumber: number;
  chapterTitle: string | null | undefined;
  format: Extract<NovelExportFormat, 'txt' | 'docx'>;
  editionId?: string | null;
  flushSave: FlushSaveInput;
  projectTitle?: string;
}

export interface ExportChapterResult {
  filePath: string;
  chapterCount: number;
  paragraphCount: number;
  exportDirectory: string;
}

export type ExportDirectoryPersistPrompt = (input: {
  directory: string;
  projectTitle: string;
  defaultScope: ExportDirectoryScope;
}) => Promise<ExportDirectoryScope | null>;

/** Flush dirty drafts, resolve export dir, write chapter — no Save dialog when configured. */
export async function exportChapter(
  input: ExportChapterInput,
  persistPrompt?: ExportDirectoryPersistPrompt,
): Promise<ExportChapterResult> {
  const saved = await flushEditorSaves(input.flushSave);
  if (!saved) {
    throw new Error('SAVE_BEFORE_EXPORT_FAILED');
  }

  try {
    return await window.khepreeNovelAI.portability.exportChapter({
      projectId: input.projectId,
      chapterNumber: input.chapterNumber,
      chapterTitle: input.chapterTitle,
      format: input.format,
      editionId: input.editionId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'EXPORT_DIRECTORY_MISSING') {
      return pickPersistAndExport(input, persistPrompt);
    }
    if (msg.startsWith('EXPORT_DIRECTORY_INACCESSIBLE:')) {
      throw new Error(msg);
    }
    throw err;
  }
}

async function pickPersistAndExport(
  input: ExportChapterInput,
  persistPrompt?: ExportDirectoryPersistPrompt,
): Promise<ExportChapterResult> {
  const pick = await window.khepreeNovelAI.portability.selectExportDirectory();
  if (pick.canceled || !pick.directory) {
    throw new Error('EXPORT_CANCELED');
  }

  const scope =
    persistPrompt != null
      ? await persistPrompt({
          directory: pick.directory,
          projectTitle: input.projectTitle ?? input.projectId,
          defaultScope: 'project',
        })
      : 'project';

  if (scope == null) {
    throw new Error('EXPORT_CANCELED');
  }

  await window.khepreeNovelAI.portability.persistExportDirectory({
    projectId: input.projectId,
    directory: pick.directory,
    scope,
  });

  return window.khepreeNovelAI.portability.exportChapter({
    projectId: input.projectId,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    format: input.format,
    editionId: input.editionId,
  });
}

export interface ExportChapterRangeInput {
  projectId: string;
  chapterFrom: number;
  chapterTo: number;
  format: Extract<NovelExportFormat, 'txt' | 'docx'>;
  editionId?: string | null;
  flushSave: FlushSaveInput;
  projectTitle?: string;
}

export async function exportChapterRange(
  input: ExportChapterRangeInput,
  persistPrompt?: ExportDirectoryPersistPrompt,
): Promise<ExportChapterResult> {
  const saved = await flushEditorSaves(input.flushSave);
  if (!saved) {
    throw new Error('SAVE_BEFORE_EXPORT_FAILED');
  }

  try {
    return await window.khepreeNovelAI.portability.exportChapterRange({
      projectId: input.projectId,
      chapterFrom: input.chapterFrom,
      chapterTo: input.chapterTo,
      format: input.format,
      editionId: input.editionId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'EXPORT_DIRECTORY_MISSING') {
      const pick = await window.khepreeNovelAI.portability.selectExportDirectory();
      if (pick.canceled || !pick.directory) {
        throw new Error('EXPORT_CANCELED');
      }
      const scope =
        persistPrompt != null
          ? await persistPrompt({
              directory: pick.directory,
              projectTitle: input.projectTitle ?? input.projectId,
              defaultScope: 'project',
            })
          : 'project';
      if (scope == null) {
        throw new Error('EXPORT_CANCELED');
      }
      await window.khepreeNovelAI.portability.persistExportDirectory({
        projectId: input.projectId,
        directory: pick.directory,
        scope,
      });
      return window.khepreeNovelAI.portability.exportChapterRange({
        projectId: input.projectId,
        chapterFrom: input.chapterFrom,
        chapterTo: input.chapterTo,
        format: input.format,
        editionId: input.editionId,
      });
    }
    throw err;
  }
}

export function parseExportDirectoryError(message: string): {
  kind: 'inaccessible' | 'canceled' | 'save_failed' | 'unknown';
  path?: string;
} {
  if (message === 'EXPORT_CANCELED') {
    return { kind: 'canceled' };
  }
  if (message === 'SAVE_BEFORE_EXPORT_FAILED') {
    return { kind: 'save_failed' };
  }
  if (message.startsWith('EXPORT_DIRECTORY_INACCESSIBLE:')) {
    return { kind: 'inaccessible', path: message.slice('EXPORT_DIRECTORY_INACCESSIBLE:'.length) };
  }
  return { kind: 'unknown' };
}
