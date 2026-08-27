import { AutomationError } from '../automation/errors/automation-errors';
import { logger } from '../logging/logger';
import type { NotebookSourceBindingType } from '@shared/constants/notebook-source-binding';
import {
  classifyNotebookSourcePresence,
  knowledgeStem,
  listStaticDuplicateNames,
} from './notebook-source-presence';

export interface KnowledgeAttachProvider {
  addDriveSources(
    sourceNames: string[],
    options?: { preferLiveOverStatic?: boolean },
  ): Promise<{ added: string[]; skipped: string[] }>;
  addFileSources(filePaths: string[]): Promise<{ added: string[]; skipped: string[] }>;
  addTextSources(
    sources: { name: string; content: string }[],
  ): Promise<{ added: string[]; skipped: string[] }>;
  verifySources(expectedNames: string[]): Promise<{
    ok: boolean;
    missing: string[];
    present: string[];
  }>;
  readSourceNames(): Promise<string[]>;
  removeSourcesByNames?(names: string[]): Promise<{ removed: string[]; failed: string[] }>;
}

export interface AttachKnowledgeSourcesInput {
  provider: KnowledgeAttachProvider;
  /** Drive LIVE titles (no .md), e.g. 00_BOOK_PROFILE */
  driveSourceNames: string[];
  knowledgeSources: { name: string; content: string }[];
  filePaths: string[];
  /** When true (Translation Notebook): Drive → file → text. */
  preferDriveLive?: boolean;
}

export interface AttachKnowledgeSourcesResult {
  bindingType: NotebookSourceBindingType;
  added: string[];
  skipped: string[];
  /** Static leftovers still in Notebook after Drive LIVE attach. */
  staticRemaining: string[];
  needsMigration: string[];
  migrationGuide: string | null;
}

/**
 * Translation Notebook: Drive LIVE → File Upload → Copied Text.
 * RESEARCH / callers with preferDriveLive=false keep legacy file-first path.
 */
export async function attachKnowledgeSources(
  input: AttachKnowledgeSourcesInput,
): Promise<AttachKnowledgeSourcesResult> {
  const preferDriveLive = input.preferDriveLive !== false;

  if (preferDriveLive) {
    return attachDriveLiveFirst(input);
  }
  return attachFileFirstLegacy(input);
}

async function attachDriveLiveFirst(
  input: AttachKnowledgeSourcesInput,
): Promise<AttachKnowledgeSourcesResult> {
  const { provider, driveSourceNames, knowledgeSources, filePaths } = input;

  try {
    const driveResult = await provider.addDriveSources(driveSourceNames, {
      preferLiveOverStatic: true,
    });
    const verified = await provider.verifySources(driveSourceNames);
    if (verified.ok || verified.present.length >= driveSourceNames.length) {
      const present = await provider.readSourceNames();
      const staticRemaining = listStaticDuplicateNames(present, driveSourceNames);
      const migration = await tryRetireStaticDuplicates(provider, staticRemaining);
      return {
        bindingType: 'DRIVE_LIVE',
        added: driveResult.added,
        skipped: driveResult.skipped,
        staticRemaining: migration.remaining,
        needsMigration: migration.needsMigration,
        migrationGuide: migration.guide,
      };
    }
    logger.warn('Drive LIVE sources incomplete; falling back to file upload', {
      missing: verified.missing,
    });
  } catch (error) {
    if (!(error instanceof AutomationError) || error.code !== 'SELECTOR_NOT_FOUND') {
      throw error;
    }
    logger.warn('Notebook Drive picker unavailable; falling back to file upload', {
      message: error.message,
    });
  }

  try {
    const fileResult = await provider.addFileSources(filePaths);
    return {
      bindingType: 'STATIC_UPLOAD',
      added: fileResult.added,
      skipped: fileResult.skipped,
      staticRemaining: fileResult.added,
      needsMigration: driveSourceNames,
      migrationGuide:
        'Drive LIVE chưa gắn được. Notebook đang dùng file upload (static). ' +
        'Sau khi Drive sync Google Docs xong, chạy lại Provision/Resume để migrate.',
    };
  } catch (error) {
    if (!(error instanceof AutomationError) || error.code !== 'SELECTOR_NOT_FOUND') {
      throw error;
    }
    logger.warn('Notebook file upload unavailable; falling back to Copied text', {
      message: error.message,
    });
  }

  const textResult = await provider.addTextSources(knowledgeSources);
  return {
    bindingType: 'COPIED_TEXT',
    added: textResult.added,
    skipped: textResult.skipped,
    staticRemaining: textResult.added,
    needsMigration: driveSourceNames,
    migrationGuide:
      'Drive LIVE + file upload đều lỗi. Notebook đang dùng Copied text (static snapshot). ' +
      'Xóa source cũ trong NotebookLM rồi Resume sau khi Drive Docs sẵn sàng.',
  };
}

async function attachFileFirstLegacy(
  input: AttachKnowledgeSourcesInput,
): Promise<AttachKnowledgeSourcesResult> {
  const { provider, knowledgeSources, filePaths, driveSourceNames } = input;

  try {
    const fileResult = await provider.addFileSources(filePaths);
    return {
      bindingType: 'STATIC_UPLOAD',
      added: fileResult.added,
      skipped: fileResult.skipped,
      staticRemaining: [],
      needsMigration: [],
      migrationGuide: null,
    };
  } catch (error) {
    if (!(error instanceof AutomationError) || error.code !== 'SELECTOR_NOT_FOUND') {
      throw error;
    }
    logger.warn('Notebook file upload unavailable; falling back to Copied text', {
      message: error.message,
    });
  }

  try {
    const textResult = await provider.addTextSources(knowledgeSources);
    return {
      bindingType: 'COPIED_TEXT',
      added: textResult.added,
      skipped: textResult.skipped,
      staticRemaining: [],
      needsMigration: [],
      migrationGuide: null,
    };
  } catch (error) {
    if (!(error instanceof AutomationError) || error.code !== 'SELECTOR_NOT_FOUND') {
      throw error;
    }
    logger.warn('Notebook Copied-text unavailable; falling back to Drive picker', {
      message: error.message,
    });
  }

  const driveResult = await provider.addDriveSources(driveSourceNames);
  return {
    bindingType: 'DRIVE_LIVE',
    added: driveResult.added,
    skipped: driveResult.skipped,
    staticRemaining: [],
    needsMigration: [],
    migrationGuide: null,
  };
}

async function tryRetireStaticDuplicates(
  provider: KnowledgeAttachProvider,
  staticNames: string[],
): Promise<{ remaining: string[]; needsMigration: string[]; guide: string | null }> {
  if (staticNames.length === 0) {
    return { remaining: [], needsMigration: [], guide: null };
  }

  if (!provider.removeSourcesByNames) {
    return {
      remaining: staticNames,
      needsMigration: staticNames.map(knowledgeStem),
      guide:
        `Drive LIVE đã gắn. Hãy xóa source static cũ trong NotebookLM: ${staticNames.join(', ')}. ` +
        'Không xóa source Drive Docs.',
    };
  }

  const result = await provider.removeSourcesByNames(staticNames);
  if (result.failed.length === 0) {
    return { remaining: [], needsMigration: [], guide: null };
  }

  return {
    remaining: result.failed,
    needsMigration: result.failed.map(knowledgeStem),
    guide:
      `Drive LIVE OK. Không tự xóa được: ${result.failed.join(', ')}. ` +
      'Xóa thủ công trong NotebookLM (menu source → Remove), giữ Google Docs.',
  };
}

export { classifyNotebookSourcePresence, listStaticDuplicateNames, knowledgeStem };
