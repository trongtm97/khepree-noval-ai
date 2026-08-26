import { formatParagraphId } from '@shared/utils/stable-id';
import { getDatabase, withTransaction } from '../db/connection';
import type { ProjectRow } from '../db/repositories/project-repository';
import { applyManualSplits, detectChapters } from './chapter-detector';
import type { DetectedChapter } from './chapter-detector';
import { parseImportFile, type ImportFormat, type ParsedSource } from './parsers';
import { newId } from '../db/utils/uuid';
import { sha256Text } from './hash';
import { normalizeNovelText } from './paragraphs/normalize';

export interface ImportPreviewChapterDto {
  chapterNumber: number;
  title: string;
  characterCount: number;
  paragraphCount: number;
  confidence: number;
  isDuplicateTitle: boolean;
  isDuplicateHash: boolean;
  sourceHash: string;
  /** First ~200 chars of body for UI glance. */
  previewText: string;
  startOffset: number;
  endOffset: number;
}

export interface ImportPreviewDto {
  previewId: string;
  fileName: string;
  format: ImportFormat;
  encoding?: string;
  encodingConfidence?: number;
  overallConfidence: number;
  warnings: string[];
  sourceHash: string;
  chapterCount: number;
  chapters: ImportPreviewChapterDto[];
}

export interface ManualSplitInput {
  offset: number;
  title?: string;
}

export interface ImportCommitResult {
  project: ProjectRow;
  chapterCount: number;
  paragraphCount: number;
}

interface PreviewSession {
  previewId: string;
  filePath: string;
  fileName: string;
  parsed: ParsedSource;
  normalizedText: string;
  sourceHash: string;
  chapters: DetectedChapter[];
  overallConfidence: number;
  warnings: string[];
  createdAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000;

export class ImportService {
  private readonly sessions = new Map<string, PreviewSession>();

  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  async createPreview(filePath: string): Promise<ImportPreviewDto> {
    this.purgeExpired();
    const parsed = await parseImportFile(filePath);
    const normalizedText = normalizeNovelText(parsed.text);
    const detection = detectChapters(normalizedText);
    const previewId = newId();
    const fileName = filePath.replace(/^.*[/\\]/, '');
    const sourceHash = sha256Text(normalizedText);

    const session: PreviewSession = {
      previewId,
      filePath,
      fileName,
      parsed,
      normalizedText,
      sourceHash,
      chapters: detection.chapters,
      overallConfidence: detection.overallConfidence,
      warnings: detection.warnings,
      createdAt: Date.now(),
    };
    this.sessions.set(previewId, session);
    return toPreviewDto(session);
  }

  /** Re-run detection or apply manual splits on an existing preview. */
  updatePreview(
    previewId: string,
    options: { manualSplits?: ManualSplitInput[]; redetect?: boolean },
  ): ImportPreviewDto {
    const session = this.requireSession(previewId);
    if (options.manualSplits && options.manualSplits.length > 0) {
      const detection = applyManualSplits(session.normalizedText, options.manualSplits);
      session.chapters = detection.chapters;
      session.overallConfidence = detection.overallConfidence;
      session.warnings = detection.warnings;
    } else if (options.redetect) {
      const detection = detectChapters(session.normalizedText);
      session.chapters = detection.chapters;
      session.overallConfidence = detection.overallConfidence;
      session.warnings = detection.warnings;
    }
    session.createdAt = Date.now();
    return toPreviewDto(session);
  }

  /**
   * Override chapter titles / drop chapters without changing stable numbering basis
   * until commit (numbers reassigned sequentially at commit).
   */
  patchPreviewChapters(
    previewId: string,
    chapters: { chapterNumber: number; title?: string; include?: boolean }[],
  ): ImportPreviewDto {
    const session = this.requireSession(previewId);
    const includeMap = new Map(chapters.map((c) => [c.chapterNumber, c]));
    const next: DetectedChapter[] = [];
    for (const ch of session.chapters) {
      const patch = includeMap.get(ch.chapterNumber);
      if (patch?.include === false) continue;
      next.push({
        ...ch,
        title: patch?.title?.trim() ? patch.title.trim() : ch.title,
      });
    }
    // Renumber sequentially — IDs assigned only at commit from final order
    session.chapters = next.map((ch, idx) => ({ ...ch, chapterNumber: idx + 1 }));
    markDupes(session.chapters);
    session.createdAt = Date.now();
    return toPreviewDto(session);
  }

  commitPreview(input: {
    previewId: string;
    projectTitle: string;
    projectId?: string;
  }): ImportCommitResult {
    const session = this.requireSession(input.previewId);
    const db = getDatabase();

    const result = withTransaction(db.getConnection(), () => {
      let project: ProjectRow;
      if (input.projectId) {
        const existing = db.projects.getById(input.projectId);
        if (!existing || existing.deleted_at) {
          throw new Error(`Project not found: ${input.projectId}`);
        }
        project = existing;
      } else {
        project = db.projects.create({
          title: input.projectTitle.trim() || session.fileName,
          status: 'draft',
        });
      }

      // Persist import_config snapshot
      db.getConnection()
        .prepare(
          `UPDATE project_settings SET import_config = ?, updated_at = ? WHERE project_id = ?`,
        )
        .run(
          JSON.stringify({
            fileName: session.fileName,
            format: session.parsed.format,
            encoding: session.parsed.encoding,
            sourceHash: session.sourceHash,
            importedAt: new Date().toISOString(),
            chapterCount: session.chapters.length,
          }),
          new Date().toISOString(),
          project.id,
        );

      let paragraphCount = 0;
      for (const chapter of session.chapters) {
        const chapterRow = db.chapters.create({
          project_id: project.id,
          chapter_number: chapter.chapterNumber,
          sequence_order: chapter.chapterNumber,
          chapter_title: chapter.title,
          source_text: chapter.body,
          status: 'pending',
        });

        chapter.paragraphs.forEach((para, idx) => {
          const sequence = idx + 1;
          db.paragraphs.create({
            chapter_id: chapterRow.id,
            paragraph_id: formatParagraphId(chapter.chapterNumber, sequence),
            sequence,
            source_text: para.text,
            trailing_newlines: para.trailingNewlines,
          });
          paragraphCount += 1;
        });
      }

      return {
        project,
        chapterCount: session.chapters.length,
        paragraphCount,
      };
    });

    this.sessions.delete(input.previewId);
    return result;
  }

  discardPreview(previewId: string): void {
    this.sessions.delete(previewId);
  }

  getNormalizedText(previewId: string): string {
    return this.requireSession(previewId).normalizedText;
  }

  private requireSession(previewId: string): PreviewSession {
    this.purgeExpired();
    const session = this.sessions.get(previewId);
    if (!session) {
      throw new Error(`Import preview expired or not found: ${previewId}`);
    }
    return session;
  }
}

function toPreviewDto(session: PreviewSession): ImportPreviewDto {
  return {
    previewId: session.previewId,
    fileName: session.fileName,
    format: session.parsed.format,
    encoding: session.parsed.encoding,
    encodingConfidence: session.parsed.encodingConfidence,
    overallConfidence: session.overallConfidence,
    warnings: session.warnings,
    sourceHash: session.sourceHash,
    chapterCount: session.chapters.length,
    chapters: session.chapters.map((ch) => ({
      chapterNumber: ch.chapterNumber,
      title: ch.title,
      characterCount: ch.characterCount,
      paragraphCount: ch.paragraphCount,
      confidence: ch.confidence,
      isDuplicateTitle: ch.isDuplicateTitle,
      isDuplicateHash: ch.isDuplicateHash,
      sourceHash: ch.sourceHash,
      previewText: ch.body.slice(0, 200),
      startOffset: ch.startOffset,
      endOffset: ch.endOffset,
    })),
  };
}

function markDupes(chapters: DetectedChapter[]): void {
  const titles = new Map<string, number>();
  const hashes = new Map<string, number>();
  for (const ch of chapters) {
    titles.set(ch.title.trim(), (titles.get(ch.title.trim()) ?? 0) + 1);
    hashes.set(ch.sourceHash, (hashes.get(ch.sourceHash) ?? 0) + 1);
  }
  for (const ch of chapters) {
    ch.isDuplicateTitle = (titles.get(ch.title.trim()) ?? 0) > 1;
    ch.isDuplicateHash = (hashes.get(ch.sourceHash) ?? 0) > 1 && ch.body.length > 0;
  }
}
