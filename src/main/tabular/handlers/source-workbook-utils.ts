import type { DatabaseManager } from '../../db/database-manager';
import type { ChapterRow } from '../../db/repositories/chapter-repository';

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v?.trim()) return v.trim();
  }
  return '';
}

export function projectHasLinkedSourceFiles(db: DatabaseManager, projectId: string): boolean {
  const project = db.projects.getById(projectId);
  if (project?.source_mode === 'FOLDER') return true;
  const row = db
    .getConnection()
    .prepare(
      `SELECT 1 FROM chapters WHERE project_id = ? AND source_file_path IS NOT NULL AND TRIM(source_file_path) <> '' LIMIT 1`,
    )
    .get(projectId);
  return Boolean(row);
}

export function deriveTranslatedStatus(db: DatabaseManager, chapterId: string): string {
  const chapter = db.chapters.getById(chapterId);
  if (!chapter) return 'unknown';
  if (chapter.status === 'needs_retranslation') return 'needs_retranslation';

  const stats = db
    .getConnection()
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM chapter_paragraphs p WHERE p.chapter_id = ?) AS total,
        (SELECT COUNT(*) FROM chapter_paragraphs p
          INNER JOIN translations t ON t.paragraph_id = p.id
          WHERE p.chapter_id = ? AND TRIM(COALESCE(t.translated_text, '')) <> '') AS translated,
        (SELECT COUNT(*) FROM chapter_paragraphs p
          INNER JOIN translations t ON t.paragraph_id = p.id
          WHERE p.chapter_id = ? AND t.status = 'reviewed') AS reviewed`,
    )
    .get(chapterId, chapterId, chapterId) as {
    total: number;
    translated: number;
    reviewed: number;
  };

  if (stats.total === 0) return 'no_paragraphs';
  if (stats.translated === 0) return 'untranslated';
  if (stats.translated < stats.total) return 'partial';
  if (stats.reviewed === stats.total) return 'reviewed';
  return 'translated';
}

export function chapterHasTranslations(db: DatabaseManager, chapterId: string): boolean {
  const row = db
    .getConnection()
    .prepare(
      `SELECT 1 FROM translations t
       INNER JOIN chapter_paragraphs p ON p.id = t.paragraph_id
       WHERE p.chapter_id = ? LIMIT 1`,
    )
    .get(chapterId);
  return Boolean(row);
}

export function rebuildChapterSourceText(db: DatabaseManager, chapterId: string): void {
  const paras = db.paragraphs.listByChapter(chapterId);
  const text = paras
    .map((p) => p.source_text + '\n'.repeat(Math.max(0, p.trailing_newlines ?? 2)))
    .join('')
    .trimEnd();
  db.chapters.updateSourceMetadata(chapterId, { source_text: text });
}

export function markChapterNeedsRetranslationIfTranslated(
  db: DatabaseManager,
  chapterId: string,
  sourceChanged: boolean,
): void {
  if (!sourceChanged) return;
  if (!chapterHasTranslations(db, chapterId)) return;
  db.chapters.updateSourceMetadata(chapterId, {
    status: 'needs_retranslation',
    source_status: 'SOURCE_MODIFIED',
  });
}

export function resolveChapter(
  db: DatabaseManager,
  projectId: string,
  chapterId: string,
  chapterNumber: string,
): ChapterRow | null {
  if (chapterId && isUuid(chapterId)) {
    const byId = db.chapters.getById(chapterId);
    if (byId?.project_id === projectId) return byId;
  }
  if (chapterNumber) {
    const n = Number(chapterNumber);
    if (Number.isFinite(n)) {
      return db.chapters.getByProjectAndNumber(projectId, n);
    }
  }
  return null;
}
