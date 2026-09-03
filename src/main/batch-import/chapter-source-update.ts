import { formatParagraphId } from '@shared/utils/stable-id';
import { getDatabase } from '../db/connection';
import { segmentParagraphs } from '../import/paragraphs/segment';
import { utcNow } from '../db/utils/timestamps';

export interface ChapterUpdateDiff {
  chapterNumber: number;
  outcome: 'unchanged' | 'updated' | 'created' | 'preserved_locks';
  preservedLockedParagraphs: number;
}

/**
 * Apply source text update for one chapter while preserving human_locked translations.
 * Matches paragraphs by sequence; locked rows keep translation and only refresh source_text.
 */
export function applyChapterSourceUpdateRespectingLocks(input: {
  projectId: string;
  chapterNumber: number;
  detected: {
    chapterTitle: string;
    normalizedText: string;
    sourceFilePath: string;
    sourceFileName: string;
    sourceFileSize: number;
    fileModifiedAt: string;
    sourceFileHash: string;
    contentHash: string;
    encoding: string;
    readError?: string;
  };
}): ChapterUpdateDiff {
  const db = getDatabase();
  const existing = db.chapters.getByProjectAndNumber(input.projectId, input.chapterNumber);
  const now = utcNow();

  if (input.detected.readError) {
    if (existing) {
      db.chapters.updateSourceMetadata(existing.id, {
        source_status: 'SOURCE_ERROR',
        last_source_scan_at: now,
      });
      return {
        chapterNumber: input.chapterNumber,
        outcome: 'unchanged',
        preservedLockedParagraphs: 0,
      };
    }
    db.chapters.create({
      project_id: input.projectId,
      chapter_number: input.chapterNumber,
      sequence_order: input.chapterNumber,
      chapter_title: input.detected.chapterTitle,
      status: 'pending',
      source_file_path: input.detected.sourceFilePath,
      source_file_name: input.detected.sourceFileName,
      source_status: 'SOURCE_ERROR',
    });
    return {
      chapterNumber: input.chapterNumber,
      outcome: 'created',
      preservedLockedParagraphs: 0,
    };
  }

  if (
    existing?.source_content_hash &&
    existing.source_content_hash === input.detected.contentHash
  ) {
    db.chapters.updateSourceMetadata(existing.id, {
      source_file_path: input.detected.sourceFilePath,
      source_file_name: input.detected.sourceFileName,
      source_file_hash: input.detected.sourceFileHash,
      source_status: 'SOURCE_READY',
      last_source_scan_at: now,
    });
    return {
      chapterNumber: input.chapterNumber,
      outcome: 'unchanged',
      preservedLockedParagraphs: 0,
    };
  }

  const newParas = segmentParagraphs(input.detected.normalizedText);

  if (!existing) {
    const row = db.chapters.create({
      project_id: input.projectId,
      chapter_number: input.chapterNumber,
      sequence_order: input.chapterNumber,
      chapter_type: 'NORMAL',
      chapter_title: input.detected.chapterTitle,
      source_text: input.detected.normalizedText,
      status: 'pending',
      source_file_path: input.detected.sourceFilePath,
      source_file_name: input.detected.sourceFileName,
      source_file_size: input.detected.sourceFileSize,
      source_file_modified_at: input.detected.fileModifiedAt,
      source_file_hash: input.detected.sourceFileHash,
      source_content_hash: input.detected.contentHash,
      source_status: 'SOURCE_READY',
      source_encoding: input.detected.encoding,
      last_source_scan_at: now,
    });
    for (const [idx, para] of newParas.entries()) {
      db.paragraphs.create({
        chapter_id: row.id,
        paragraph_id: formatParagraphId(input.chapterNumber, idx + 1),
        sequence: idx + 1,
        source_text: para.text,
        trailing_newlines: para.trailingNewlines,
      });
    }
    return {
      chapterNumber: input.chapterNumber,
      outcome: 'created',
      preservedLockedParagraphs: 0,
    };
  }

  const editionId = db.projects.getById(input.projectId)?.active_edition_id ?? null;
  const oldParas = db.paragraphs.listByChapter(existing.id);
  const lockedSeq = new Set<number>();
  for (const para of oldParas) {
    const tr = db.translations.getByParagraphId(para.id, editionId);
    if (tr?.human_locked === 1) {
      lockedSeq.add(para.sequence);
    }
  }

  let preservedLocked = 0;
  const maxSeq = Math.max(oldParas.length, newParas.length);
  for (let i = 0; i < maxSeq; i += 1) {
    const seq = i + 1;
    const old = oldParas.find((p) => p.sequence === seq);
    const neu = newParas[i];
    const locked = lockedSeq.has(seq);

    if (locked && old) {
      preservedLocked += 1;
      if (neu) {
        db.paragraphs.update(old.id, neu.text, neu.trailingNewlines);
      }
      continue;
    }

    if (old && !neu) {
      db.paragraphs.delete(old.id);
      continue;
    }

    if (!old && neu) {
      db.paragraphs.create({
        chapter_id: existing.id,
        paragraph_id: formatParagraphId(input.chapterNumber, seq),
        sequence: seq,
        source_text: neu.text,
        trailing_newlines: neu.trailingNewlines,
      });
      continue;
    }

    if (old && neu) {
      db.paragraphs.update(old.id, neu.text, neu.trailingNewlines);
    }
  }

  db.chapters.updateSourceMetadata(existing.id, {
    chapter_title: input.detected.chapterTitle,
    source_text: input.detected.normalizedText,
    source_file_path: input.detected.sourceFilePath,
    source_file_name: input.detected.sourceFileName,
    source_file_size: input.detected.sourceFileSize,
    source_file_modified_at: input.detected.fileModifiedAt,
    source_file_hash: input.detected.sourceFileHash,
    source_content_hash: input.detected.contentHash,
    source_status: 'SOURCE_READY',
    source_encoding: input.detected.encoding,
    last_source_scan_at: now,
  });

  return {
    chapterNumber: input.chapterNumber,
    outcome: preservedLocked > 0 ? 'preserved_locks' : 'updated',
    preservedLockedParagraphs: preservedLocked,
  };
}
