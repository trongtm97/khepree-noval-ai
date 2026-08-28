import fsSync from 'node:fs';
import type { DatabaseManager } from '../db/database-manager';
import { buildLanguageDetectionSample } from '../language/build-language-detection-sample';
import { detectSourceLanguage } from '../language/language-detect';
import { normalizeLanguageCode } from '@shared/constants/language-profile';
import { utcNow } from '../db/utils/timestamps';
import type { SourceLanguageDetection } from '@shared/schemas/source-language';
import { resolveProjectSourceLanguage } from './resolve-project-source-language';

export async function redetectProjectSourceLanguage(
  db: DatabaseManager,
  projectId: string,
  options?: { apply?: boolean },
): Promise<{
  detection: SourceLanguageDetection;
  currentLanguage: string;
  changed: boolean;
  hasTranslations: boolean;
  applied: boolean;
  requiresConfirmation: boolean;
}> {
  const project = db.projects.getById(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const chapters = db.chapters.listByProject(projectId);
  const sampleText = buildLanguageDetectionSample({
    chapters: chapters.map((ch) => ({
      chapterNumber: ch.chapter_number ?? 0,
      chapterTitle: ch.chapter_title ?? ch.display_title ?? '',
      sourceFilePath: ch.source_file_path ?? '',
    })),
    readFile: (filePath) => {
      if (!filePath) return null;
      try {
        return fsSync.readFileSync(filePath, 'utf8');
      } catch {
        return null;
      }
    },
  });

  const detection = await detectSourceLanguage({
    sampleText,
    hintCode: project.source_language_hint,
  });

  const currentLanguage = resolveProjectSourceLanguage(project);
  const changed =
    normalizeLanguageCode(detection.detectedLanguage) !==
    normalizeLanguageCode(currentLanguage);

  const row = db
    .getConnection()
    .prepare(
      `SELECT COUNT(DISTINCT c.id) AS c
       FROM translations t
       INNER JOIN chapter_paragraphs p ON p.id = t.paragraph_id
       INNER JOIN chapters c ON c.id = p.chapter_id
       WHERE c.project_id = ? AND t.translated_text IS NOT NULL AND TRIM(t.translated_text) != ''`,
    )
    .get(projectId) as { c: number };
  const hasTranslations = row.c > 0;
  const requiresConfirmation = changed && hasTranslations;

  let applied = false;
  if (options?.apply && changed) {
    db.getConnection()
      .prepare(
        `UPDATE projects SET
          source_language = ?,
          source_language_confidence = ?,
          source_language_detection_method = ?,
          source_language_detection_checked_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        detection.detectedLanguage,
        detection.confidence,
        detection.method,
        utcNow(),
        utcNow(),
        projectId,
      );
    applied = true;
  }

  return {
    detection,
    currentLanguage,
    changed,
    hasTranslations,
    applied,
    requiresConfirmation,
  };
}
