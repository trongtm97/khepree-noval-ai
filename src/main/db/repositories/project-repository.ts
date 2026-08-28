import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { SourceFolderStatus, SourceMode } from '@shared/constants/source-folder';
import type { MetadataSource } from '@shared/constants/book-metadata';
import type { SourceDetectionMethod, SourceLanguageMode } from '@shared/constants/source-language';
import { normalizeLanguageCode } from '@shared/constants/language-profile';

export interface ProjectRow {
  id: string;
  title: string;
  source_language: string;
  target_language: string;
  source_language_mode: SourceLanguageMode;
  source_language_hint: string | null;
  source_language_confidence: number | null;
  source_language_detection_method: SourceDetectionMethod | null;
  source_language_detection_checked_at: string | null;
  genre: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  source_mode: SourceMode;
  source_folder_path: string | null;
  source_folder_status: SourceFolderStatus | null;
  watch_folder_enabled: number;
  scan_on_startup: number;
  auto_import_new_chapters: number;
  auto_queue_new_chapters: number;
  auto_translate_new_chapters: number;
  expected_start_chapter: number | null;
  expected_end_chapter: number | null;
  last_folder_scan_at: string | null;
  title_cn: string | null;
  title_vi: string | null;
  source_title: string | null;
  target_title: string | null;
  title_original: string | null;
  alternative_titles: string | null;
  author_name: string | null;
  author_name_cn: string | null;
  subgenres: string | null;
  publication_status: string | null;
  expected_chapter_count: number | null;
  introduction: string | null;
  official_summary: string | null;
  notes: string | null;
  cover_path: string | null;
  metadata_source: MetadataSource | null;
  metadata_updated_at: string | null;
  book_profile_dirty: number;
  metadata_fields: string | null;
  bootstrap_status: string;
  bootstrap_started_at: string | null;
  bootstrap_completed_at: string | null;
  bootstrap_through_chapter: number | null;
  bootstrap_version: string;
  bootstrap_chapter_count: number;
  active_edition_id: string | null;
  export_directory: string | null;
}

export interface ProjectMetadataPatch {
  title?: string;
  source_title?: string | null;
  target_title?: string | null;
  title_cn?: string | null;
  title_vi?: string | null;
  title_original?: string | null;
  alternative_titles?: string | null;
  author_name?: string | null;
  author_name_cn?: string | null;
  genre?: string | null;
  subgenres?: string | null;
  publication_status?: string | null;
  expected_chapter_count?: number | null;
  description?: string | null;
  introduction?: string | null;
  official_summary?: string | null;
  notes?: string | null;
  cover_path?: string | null;
  metadata_source?: MetadataSource | null;
  metadata_fields?: string | null;
  book_profile_dirty?: boolean;
}

export interface CreateProjectInput {
  title: string;
  source_language?: string;
  target_language?: string;
  source_language_mode?: SourceLanguageMode;
  source_language_hint?: string | null;
  source_language_confidence?: number | null;
  source_language_detection_method?: SourceDetectionMethod | null;
  source_language_detection_checked_at?: string | null;
  genre?: string | null;
  description?: string | null;
  status?: string;
  source_mode?: SourceMode;
  source_folder_path?: string | null;
  source_folder_status?: SourceFolderStatus | null;
  watch_folder_enabled?: boolean;
  scan_on_startup?: boolean;
  auto_import_new_chapters?: boolean;
  auto_queue_new_chapters?: boolean;
  auto_translate_new_chapters?: boolean;
  expected_start_chapter?: number | null;
  expected_end_chapter?: number | null;
  title_cn?: string | null;
  title_vi?: string | null;
  source_title?: string | null;
  target_title?: string | null;
  author_name?: string | null;
  expected_chapter_count?: number | null;
  official_summary?: string | null;
}

export interface SourceFolderSettingsPatch {
  source_folder_path?: string | null;
  source_folder_status?: SourceFolderStatus | null;
  source_mode?: SourceMode;
  watch_folder_enabled?: boolean;
  scan_on_startup?: boolean;
  auto_import_new_chapters?: boolean;
  auto_queue_new_chapters?: boolean;
  auto_translate_new_chapters?: boolean;
  expected_start_chapter?: number | null;
  expected_end_chapter?: number | null;
  last_folder_scan_at?: string | null;
}

export class ProjectRepository extends BaseRepository {
  create(input: CreateProjectInput): ProjectRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO projects (
          id, title, source_language, target_language, genre, description, status,
          created_at, updated_at, deleted_at,
          source_language_mode, source_language_hint, source_language_confidence,
          source_language_detection_method, source_language_detection_checked_at,
          source_mode, source_folder_path, source_folder_status,
          watch_folder_enabled, scan_on_startup,
          auto_import_new_chapters, auto_queue_new_chapters, auto_translate_new_chapters,
          expected_start_chapter, expected_end_chapter, last_folder_scan_at,
          title_cn, title_vi, source_title, target_title, author_name, expected_chapter_count, official_summary,
          book_profile_dirty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        id,
        input.title,
        input.source_language
          ? normalizeLanguageCode(input.source_language)
          : 'zh-Hans',
        input.target_language
          ? normalizeLanguageCode(input.target_language)
          : 'vi',
        input.genre ?? null,
        input.description ?? null,
        input.status ?? 'draft',
        ts.created_at,
        ts.updated_at,
        input.source_language_mode ?? 'AUTO',
        input.source_language_hint
          ? normalizeLanguageCode(input.source_language_hint)
          : null,
        input.source_language_confidence ?? null,
        input.source_language_detection_method ?? null,
        input.source_language_detection_checked_at ?? utcNow(),
        input.source_mode ?? 'LEGACY_IMPORT',
        input.source_folder_path ?? null,
        input.source_folder_status ?? null,
        input.watch_folder_enabled === false ? 0 : 1,
        input.scan_on_startup === false ? 0 : 1,
        input.auto_import_new_chapters ? 1 : 0,
        input.auto_queue_new_chapters ? 1 : 0,
        input.auto_translate_new_chapters ? 1 : 0,
        input.expected_start_chapter ?? null,
        input.expected_end_chapter ?? null,
        null,
        input.title_cn ?? input.source_title ?? null,
        input.title_vi ?? input.target_title ?? null,
        input.source_title ?? input.title_cn ?? null,
        input.target_title ?? input.title_vi ?? null,
        input.author_name ?? null,
        input.expected_chapter_count ?? null,
        input.official_summary ?? null,
      );

    const settingsId = newId();
    const settingsTs = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO project_settings (id, project_id, style_config, import_config, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, ?, ?)`,
      )
      .run(settingsId, id, settingsTs.created_at, settingsTs.updated_at);

    return this.assertRow(this.getById(id), 'project', id);
  }

  getById(id: string): ProjectRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL`)
        .get(id) as ProjectRow | undefined) ?? null
    );
  }

  list(): ProjectRow[] {
    return this.db
      .prepare(
        `SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
      )
      .all() as ProjectRow[];
  }

  listFolderProjects(): ProjectRow[] {
    return this.db
      .prepare(
        `SELECT * FROM projects
         WHERE deleted_at IS NULL AND source_mode = 'FOLDER'
         ORDER BY updated_at DESC`,
      )
      .all() as ProjectRow[];
  }

  update(id: string, patch: Partial<CreateProjectInput>): ProjectRow | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    this.db
      .prepare(
        `UPDATE projects SET
          title = ?,
          source_language = ?,
          target_language = ?,
          genre = ?,
          description = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.title ?? existing.title,
        patch.source_language ?? existing.source_language,
        patch.target_language ?? existing.target_language,
        patch.genre !== undefined ? patch.genre : existing.genre,
        patch.description !== undefined ? patch.description : existing.description,
        patch.status ?? existing.status,
        utcNow(),
        id,
      );

    return this.getById(id);
  }

  updateLanguages(
    id: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): ProjectRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE projects SET source_language = ?, target_language = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        normalizeLanguageCode(sourceLanguage),
        normalizeLanguageCode(targetLanguage),
        utcNow(),
        id,
      );
    return this.getById(id);
  }

  setActiveEditionId(id: string, editionId: string | null): ProjectRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    this.db
      .prepare(`UPDATE projects SET active_edition_id = ?, updated_at = ? WHERE id = ?`)
      .run(editionId, utcNow(), id);
    return this.getById(id);
  }

  getStyleConfig(projectId: string): string | null {
    const row = this.db
      .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
      .get(projectId) as { style_config: string | null } | undefined;
    return row?.style_config ?? null;
  }

  setStyleConfig(projectId: string, styleConfig: string | null): void {
    this.db
      .prepare(
        `UPDATE project_settings SET style_config = ?, updated_at = ? WHERE project_id = ?`,
      )
      .run(styleConfig, utcNow(), projectId);
  }

  updateMetadata(id: string, patch: ProjectMetadataPatch): ProjectRow | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const nextSourceTitle =
      patch.source_title !== undefined
        ? patch.source_title
        : patch.title_cn !== undefined
          ? patch.title_cn
          : (existing.source_title ?? existing.title_cn);
    const nextTargetTitle =
      patch.target_title !== undefined
        ? patch.target_title
        : patch.title_vi !== undefined
          ? patch.title_vi
          : (existing.target_title ?? existing.title_vi);
    const nextTitleCn = patch.title_cn !== undefined ? patch.title_cn : nextSourceTitle;
    const nextTitleVi = patch.title_vi !== undefined ? patch.title_vi : nextTargetTitle;

    this.db
      .prepare(
        `UPDATE projects SET
          title = ?,
          title_cn = ?,
          title_vi = ?,
          source_title = ?,
          target_title = ?,
          title_original = ?,
          alternative_titles = ?,
          author_name = ?,
          author_name_cn = ?,
          genre = ?,
          subgenres = ?,
          publication_status = ?,
          expected_chapter_count = ?,
          description = ?,
          introduction = ?,
          official_summary = ?,
          notes = ?,
          cover_path = ?,
          metadata_source = ?,
          metadata_fields = ?,
          metadata_updated_at = ?,
          book_profile_dirty = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.title ?? existing.title,
        nextTitleCn,
        nextTitleVi,
        nextSourceTitle,
        nextTargetTitle,
        patch.title_original !== undefined ? patch.title_original : existing.title_original,
        patch.alternative_titles !== undefined
          ? patch.alternative_titles
          : existing.alternative_titles,
        patch.author_name !== undefined ? patch.author_name : existing.author_name,
        patch.author_name_cn !== undefined ? patch.author_name_cn : existing.author_name_cn,
        patch.genre !== undefined ? patch.genre : existing.genre,
        patch.subgenres !== undefined ? patch.subgenres : existing.subgenres,
        patch.publication_status !== undefined
          ? patch.publication_status
          : existing.publication_status,
        patch.expected_chapter_count !== undefined
          ? patch.expected_chapter_count
          : existing.expected_chapter_count,
        patch.description !== undefined ? patch.description : existing.description,
        patch.introduction !== undefined ? patch.introduction : existing.introduction,
        patch.official_summary !== undefined
          ? patch.official_summary
          : existing.official_summary,
        patch.notes !== undefined ? patch.notes : existing.notes,
        patch.cover_path !== undefined ? patch.cover_path : existing.cover_path,
        patch.metadata_source !== undefined ? patch.metadata_source : existing.metadata_source,
        patch.metadata_fields !== undefined ? patch.metadata_fields : existing.metadata_fields,
        utcNow(),
        patch.book_profile_dirty === false ? 0 : 1,
        utcNow(),
        id,
      );

    return this.getById(id);
  }

  updateSourceFolderSettings(id: string, patch: SourceFolderSettingsPatch): ProjectRow | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    this.db
      .prepare(
        `UPDATE projects SET
          source_mode = ?,
          source_folder_path = ?,
          source_folder_status = ?,
          watch_folder_enabled = ?,
          scan_on_startup = ?,
          auto_import_new_chapters = ?,
          auto_queue_new_chapters = ?,
          auto_translate_new_chapters = ?,
          expected_start_chapter = ?,
          expected_end_chapter = ?,
          last_folder_scan_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.source_mode ?? existing.source_mode,
        patch.source_folder_path !== undefined
          ? patch.source_folder_path
          : existing.source_folder_path,
        patch.source_folder_status !== undefined
          ? patch.source_folder_status
          : existing.source_folder_status,
        patch.watch_folder_enabled !== undefined
          ? patch.watch_folder_enabled
            ? 1
            : 0
          : existing.watch_folder_enabled,
        patch.scan_on_startup !== undefined
          ? patch.scan_on_startup
            ? 1
            : 0
          : existing.scan_on_startup,
        patch.auto_import_new_chapters !== undefined
          ? patch.auto_import_new_chapters
            ? 1
            : 0
          : existing.auto_import_new_chapters,
        patch.auto_queue_new_chapters !== undefined
          ? patch.auto_queue_new_chapters
            ? 1
            : 0
          : existing.auto_queue_new_chapters,
        patch.auto_translate_new_chapters !== undefined
          ? patch.auto_translate_new_chapters
            ? 1
            : 0
          : existing.auto_translate_new_chapters,
        patch.expected_start_chapter !== undefined
          ? patch.expected_start_chapter
          : existing.expected_start_chapter,
        patch.expected_end_chapter !== undefined
          ? patch.expected_end_chapter
          : existing.expected_end_chapter,
        patch.last_folder_scan_at !== undefined
          ? patch.last_folder_scan_at
          : existing.last_folder_scan_at,
        utcNow(),
        id,
      );

    return this.getById(id);
  }

  updateBootstrap(
    id: string,
    patch: {
      bootstrap_status?: string;
      bootstrap_started_at?: string | null;
      bootstrap_completed_at?: string | null;
      bootstrap_through_chapter?: number | null;
      bootstrap_version?: string;
      bootstrap_chapter_count?: number;
    },
  ): ProjectRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE projects SET
          bootstrap_status = ?,
          bootstrap_started_at = ?,
          bootstrap_completed_at = ?,
          bootstrap_through_chapter = ?,
          bootstrap_version = ?,
          bootstrap_chapter_count = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.bootstrap_status ?? existing.bootstrap_status,
        patch.bootstrap_started_at !== undefined
          ? patch.bootstrap_started_at
          : existing.bootstrap_started_at ?? null,
        patch.bootstrap_completed_at !== undefined
          ? patch.bootstrap_completed_at
          : existing.bootstrap_completed_at ?? null,
        patch.bootstrap_through_chapter !== undefined
          ? patch.bootstrap_through_chapter
          : existing.bootstrap_through_chapter ?? null,
        patch.bootstrap_version ?? existing.bootstrap_version,
        patch.bootstrap_chapter_count ?? existing.bootstrap_chapter_count,
        utcNow(),
        id,
      );
    return this.getById(id);
  }

  updateExportDirectory(id: string, exportDirectory: string | null): ProjectRow | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }
    const normalized =
      exportDirectory == null || exportDirectory.trim() === ''
        ? null
        : exportDirectory.trim();
    this.db
      .prepare(`UPDATE projects SET export_directory = ?, updated_at = ? WHERE id = ?`)
      .run(normalized, utcNow(), id);
    return this.getById(id);
  }

  softDelete(id: string): boolean {
    const result = this.db
      .prepare(`UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(utcNow(), utcNow(), id);
    return result.changes > 0;
  }

  hardDelete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
    return result.changes > 0;
  }
}
