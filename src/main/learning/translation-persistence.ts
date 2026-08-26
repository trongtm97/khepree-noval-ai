import type { DatabaseManager } from '../db/database-manager';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { TranslationVersionSource } from '@shared/constants/translation-editor';
import { logger } from '../logging/logger';

export interface PersistTranslationsInput {
  projectId: string;
  parsed: ParsedBatchResult;
  versionSource: TranslationVersionSource;
}

/**
 * Persist parsed translation lines to SQLite.
 * Skips paragraphs with human_locked translations (manual edits).
 */
export function persistParsedTranslations(
  db: DatabaseManager,
  input: PersistTranslationsInput,
): { saved: number; skipped: number } {
  let saved = 0;
  let skipped = 0;

  for (const line of input.parsed.translations) {
    const para = db.paragraphs.getByStableId(line.paragraphId);
    if (!para) continue;

    const chapter = db.chapters.getById(para.chapter_id);
    if (chapter?.project_id !== input.projectId) continue;

    const result = db.translations.upsert({
      paragraph_id: para.id,
      translated_text: line.text,
      status: 'translated',
      version_source: input.versionSource,
      respectHumanLock: true,
    });
    if (result.skipped) skipped += 1;
    else saved += 1;
  }

  if (saved === 0 && skipped === 0 && input.parsed.translations.length > 0) {
    logger.warn('persistParsedTranslations: no lines matched paragraphs', {
      projectId: input.projectId,
      lineCount: input.parsed.translations.length,
    });
  }

  return { saved, skipped };
}
