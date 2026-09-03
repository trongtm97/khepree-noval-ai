import { createHash } from 'node:crypto';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface ParagraphRow {
  id: string;
  chapter_id: string;
  paragraph_id: string;
  sequence: number;
  source_text: string;
  source_hash: string;
  trailing_newlines: number;
  created_at: string;
  updated_at: string;
}

export interface CreateParagraphInput {
  chapter_id: string;
  paragraph_id: string;
  sequence: number;
  source_text: string;
  /** Newlines after paragraph on export; default 2 (blank line). */
  trailing_newlines?: number;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export class ParagraphRepository extends BaseRepository {
  create(input: CreateParagraphInput): ParagraphRow {
    const id = newId();
    const ts = touchTimestamps();

    this.db
      .prepare(
        `INSERT INTO chapter_paragraphs (
          id, chapter_id, paragraph_id, sequence, source_text, source_hash,
          trailing_newlines, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.chapter_id,
        input.paragraph_id,
        input.sequence,
        input.source_text,
        hashText(input.source_text),
        input.trailing_newlines ?? 2,
        ts.created_at,
        ts.updated_at,
      );

    return this.assertRow(this.getById(id), 'paragraph', id);
  }

  getById(id: string): ParagraphRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM chapter_paragraphs WHERE id = ?`)
        .get(id) as ParagraphRow | undefined) ?? null
    );
  }

  getByStableId(paragraphId: string): ParagraphRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM chapter_paragraphs WHERE paragraph_id = ?`)
        .get(paragraphId) as ParagraphRow | undefined) ?? null
    );
  }

  listByChapter(chapterId: string): ParagraphRow[] {
    return this.db
      .prepare(
        `SELECT * FROM chapter_paragraphs WHERE chapter_id = ? ORDER BY sequence ASC`,
      )
      .all(chapterId) as ParagraphRow[];
  }

  update(
    id: string,
    sourceText: string,
    trailingNewlines?: number,
  ): ParagraphRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const result = this.db
      .prepare(
        `UPDATE chapter_paragraphs SET
          source_text = ?, source_hash = ?, trailing_newlines = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        sourceText,
        hashText(sourceText),
        trailingNewlines ?? existing.trailing_newlines,
        utcNow(),
        id,
      );

    if (result.changes === 0) {
      return null;
    }
    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM chapter_paragraphs WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  deleteByChapter(chapterId: string): number {
    const result = this.db
      .prepare(`DELETE FROM chapter_paragraphs WHERE chapter_id = ?`)
      .run(chapterId);
    return result.changes;
  }
}
