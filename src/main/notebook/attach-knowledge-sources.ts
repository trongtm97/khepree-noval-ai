import { AutomationError } from '../automation/errors/automation-errors';
import { logger } from '../logging/logger';
import type { NotebookSourceBindingType } from '@shared/constants/notebook-source-binding';

export interface KnowledgeAttachProvider {
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
  knowledgeSources: { name: string; content: string }[];
  filePaths: string[];
}

export interface AttachKnowledgeSourcesResult {
  bindingType: NotebookSourceBindingType;
  added: string[];
  skipped: string[];
  staticRemaining: string[];
  needsMigration: string[];
  migrationGuide: string | null;
}

/**
 * Translation Notebook: local file upload → copied text fallback.
 */
export async function attachKnowledgeSources(
  input: AttachKnowledgeSourcesInput,
): Promise<AttachKnowledgeSourcesResult> {
  return attachFileFirst(input);
}

async function attachFileFirst(
  input: AttachKnowledgeSourcesInput,
): Promise<AttachKnowledgeSourcesResult> {
  const { provider, knowledgeSources, filePaths } = input;
  const expectedNames = knowledgeSources.map((s) => s.name);

  try {
    const fileResult = await provider.addFileSources(filePaths);
    const verified = await provider.verifySources(expectedNames);
    if (verified.ok || verified.present.length >= expectedNames.length) {
      return {
        bindingType: 'STATIC_UPLOAD',
        added: fileResult.added,
        skipped: fileResult.skipped,
        staticRemaining: [],
        needsMigration: [],
        migrationGuide: null,
      };
    }
    logger.warn('File upload sources incomplete; falling back to copied text', {
      missing: verified.missing,
    });
  } catch (error) {
    if (!(error instanceof AutomationError) || error.code !== 'SELECTOR_NOT_FOUND') {
      throw error;
    }
    logger.warn('Notebook file upload unavailable; falling back to copied text', {
      message: error.message,
    });
  }

  const textResult = await provider.addTextSources(knowledgeSources);
  return {
    bindingType: 'COPIED_TEXT',
    added: textResult.added,
    skipped: textResult.skipped,
    staticRemaining: [],
    needsMigration: [],
    migrationGuide: null,
  };
}
