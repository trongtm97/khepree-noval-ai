import type { DatabaseManager } from '../db/database-manager';
import type { LibrarySearchFtsRow } from '../db/repositories/library-search-repository';
import type { LibrarySearchEntityType } from '@shared/constants/library-search';
import { buildChapterOpenHref } from '../whole-book-audit/audit-report-export';
import { entityKey, joinSearchBody } from './fts-query';

export interface LibraryIndexSettings {
  indexSourceText: boolean;
  indexTranslationText: boolean;
}

export interface LibraryIndexEntityRef {
  entityType: LibrarySearchEntityType;
  entityId: string;
  projectId?: string | null;
}

export function resolveSeriesIdForProject(db: DatabaseManager, projectId: string): string | null {
  const row = db
    .getConnection()
    .prepare(
      `SELECT series_id FROM fiction_series_volumes WHERE project_id = ? ORDER BY volume_order ASC LIMIT 1`,
    )
    .get(projectId) as { series_id: string } | undefined;
  return row?.series_id ?? null;
}

export function buildLibrarySearchRoute(input: {
  entityType: LibrarySearchEntityType;
  entityId: string;
  projectId: string | null;
  chapterId?: string | null;
  stableParagraphId?: string | null;
}): string {
  switch (input.entityType) {
    case 'project':
      return `/projects/${input.entityId}`;
    case 'chapter':
      return buildChapterOpenHref(input.projectId ?? '', input.entityId, null);
    case 'term':
      return input.projectId
        ? `/projects/${input.projectId}/terms?q=${encodeURIComponent(input.entityId)}`
        : `/terms?q=${encodeURIComponent(input.entityId)}`;
    case 'character':
      return input.projectId
        ? `/projects/${input.projectId}/characters?characterId=${encodeURIComponent(input.entityId)}`
        : '/projects';
    case 'translation':
      return buildChapterOpenHref(
        input.projectId ?? '',
        input.chapterId ?? null,
        input.stableParagraphId ?? null,
      );
    case 'qa_finding':
      return buildChapterOpenHref(
        input.projectId ?? '',
        input.chapterId ?? null,
        input.stableParagraphId ?? null,
      );
    case 'series':
      return `/series/${input.entityId}`;
    case 'world':
      return `/series/${input.entityId}`;
    default:
      return '/';
  }
}

export function buildIndexRow(
  db: DatabaseManager,
  ref: LibraryIndexEntityRef,
  settings: LibraryIndexSettings,
): LibrarySearchFtsRow | null {
  switch (ref.entityType) {
    case 'project':
      return buildProjectRow(db, ref.entityId);
    case 'chapter':
      return buildChapterRow(db, ref.entityId, settings);
    case 'term':
      return buildTermRow(db, ref.entityId);
    case 'character':
      return buildCharacterRow(db, ref.entityId);
    case 'translation':
      return buildTranslationRow(db, ref.entityId, settings);
    case 'qa_finding':
      return buildQaFindingRow(db, ref.entityId);
    case 'series':
      return buildSeriesRow(db, ref.entityId);
    case 'world':
      return buildWorldRow(db, ref.entityId);
    default:
      return null;
  }
}

function buildProjectRow(db: DatabaseManager, projectId: string): LibrarySearchFtsRow | null {
  const project = db.projects.getById(projectId);
  if (!project || project.deleted_at) return null;
  const seriesId = resolveSeriesIdForProject(db, projectId);
  const body = joinSearchBody([
    project.title,
    project.title_cn,
    project.title_vi,
    project.title_original,
    project.alternative_titles,
    project.author_name,
    project.description,
    project.introduction,
  ]);
  return {
    entity_key: entityKey('project', projectId),
    entity_type: 'project',
    project_id: projectId,
    series_id: seriesId,
    status: project.status,
    language: project.source_language,
    body,
  };
}

function buildChapterRow(
  db: DatabaseManager,
  chapterId: string,
  settings: LibraryIndexSettings,
): LibrarySearchFtsRow | null {
  const chapter = db.chapters.getById(chapterId);
  if (!chapter) return null;
  const project = db.projects.getById(chapter.project_id);
  if (!project || project.deleted_at) return null;

  const parts = [
    chapter.display_title,
    chapter.chapter_title,
    chapter.chapter_number != null ? String(chapter.chapter_number) : null,
  ];
  if (settings.indexSourceText) {
    parts.push(chapter.source_text);
    if (!chapter.source_text?.trim()) {
      const paras = db.paragraphs.listByChapter(chapterId);
      parts.push(paras.map((p) => p.source_text).join('\n'));
    }
  }

  return {
    entity_key: entityKey('chapter', chapterId),
    entity_type: 'chapter',
    project_id: chapter.project_id,
    series_id: resolveSeriesIdForProject(db, chapter.project_id),
    status: chapter.source_status,
    language: project.source_language,
    body: joinSearchBody(parts),
  };
}

function buildTermRow(db: DatabaseManager, termId: string): LibrarySearchFtsRow | null {
  const term = db.terms.getById(termId);
  if (!term || term.deleted_at) return null;
  const translations = db.terms.listTranslations(termId);
  const body = joinSearchBody([
    term.source_text,
    term.source_simplified,
    term.source_traditional,
    term.pinyin,
    term.transliteration,
    translations.map((t) => t.target_text).join(' '),
    term.notes,
  ]);

  let projectId: string | null = null;
  if (term.scope === 'PROJECT' && term.scope_ref) {
    projectId = term.scope_ref;
  } else if (term.scope === 'SERIES' && term.scope_ref) {
    const vol = db
      .getConnection()
      .prepare(
        `SELECT project_id FROM fiction_series_volumes WHERE series_id = ? ORDER BY volume_order LIMIT 1`,
      )
      .get(term.scope_ref) as { project_id: string } | undefined;
    projectId = vol?.project_id ?? null;
  }

  return {
    entity_key: entityKey('term', termId),
    entity_type: 'term',
    project_id: projectId,
    series_id: term.scope === 'SERIES' ? term.scope_ref : null,
    status: term.status,
    language: term.source_language ?? term.target_language,
    body,
  };
}

function buildCharacterRow(db: DatabaseManager, characterId: string): LibrarySearchFtsRow | null {
  const character = db.characters.getById(characterId);
  if (!character) return null;
  const project = db.projects.getById(character.project_id);
  if (!project || project.deleted_at) return null;
  const aliases = db.characters.listAliases(characterId);
  const body = joinSearchBody([
    character.canonical_name,
    character.translated_name,
    character.description,
    aliases.map((a) => a.alias).join(' '),
  ]);
  return {
    entity_key: entityKey('character', characterId),
    entity_type: 'character',
    project_id: character.project_id,
    series_id: resolveSeriesIdForProject(db, character.project_id),
    status: character.status,
    language: project.target_language,
    body,
  };
}

function buildTranslationRow(
  db: DatabaseManager,
  translationId: string,
  settings: LibraryIndexSettings,
): LibrarySearchFtsRow | null {
  if (!settings.indexTranslationText) return null;
  const translation = db.translations.getById(translationId);
  if (!translation) return null;
  const paragraph = db.paragraphs.getById(translation.paragraph_id);
  if (!paragraph) return null;
  const chapter = db.chapters.getById(paragraph.chapter_id);
  if (!chapter) return null;
  const project = db.projects.getById(chapter.project_id);
  if (!project || project.deleted_at) return null;

  const body = joinSearchBody([translation.translated_text, paragraph.source_text]);
  return {
    entity_key: entityKey('translation', translationId),
    entity_type: 'translation',
    project_id: chapter.project_id,
    series_id: resolveSeriesIdForProject(db, chapter.project_id),
    status: translation.status,
    language: project.target_language,
    body,
  };
}

function buildQaFindingRow(db: DatabaseManager, findingId: string): LibrarySearchFtsRow | null {
  const finding = db.translationQaFindings.getById(findingId);
  if (!finding) return null;
  const project = db.projects.getById(finding.project_id);
  if (!project || project.deleted_at) return null;
  const body = joinSearchBody([
    finding.code,
    finding.message,
    finding.expected_text,
    finding.found_text,
    finding.stable_paragraph_id,
  ]);
  return {
    entity_key: entityKey('qa_finding', findingId),
    entity_type: 'qa_finding',
    project_id: finding.project_id,
    series_id: resolveSeriesIdForProject(db, finding.project_id),
    status: finding.status,
    language: project.target_language,
    body,
  };
}

function buildSeriesRow(db: DatabaseManager, seriesId: string): LibrarySearchFtsRow | null {
  const series = db.fictionSeries.getSeriesById(seriesId);
  if (!series || series.deleted_at) return null;
  const world = db.fictionSeries.getWorldState(seriesId);
  const styleRules = db.fictionSeries.listStyleRules(seriesId);
  const body = joinSearchBody([
    series.title,
    series.description,
    series.genre,
    world?.world_knowledge_json,
    ...styleRules.map((r) => r.content),
  ]);
  return {
    entity_key: entityKey('series', seriesId),
    entity_type: 'series',
    project_id: null,
    series_id: seriesId,
    status: 'active',
    language: null,
    body,
  };
}

/** Shared series world lore — entity_id is series_id; opens Series page. */
function buildWorldRow(db: DatabaseManager, seriesId: string): LibrarySearchFtsRow | null {
  const series = db.fictionSeries.getSeriesById(seriesId);
  if (!series || series.deleted_at) return null;
  const world = db.fictionSeries.getWorldState(seriesId);
  if (!world?.world_knowledge_json?.trim()) return null;
  const styleRules = db.fictionSeries.listStyleRules(seriesId);
  const body = joinSearchBody([
    series.title,
    'world',
    world.world_knowledge_json,
    ...styleRules.map((r) => `${r.rule_kind}: ${r.content}`),
  ]);
  return {
    entity_key: entityKey('world', seriesId),
    entity_type: 'world',
    project_id: null,
    series_id: seriesId,
    status: 'active',
    language: null,
    body,
  };
}

export function listAllIndexRefs(db: DatabaseManager): LibraryIndexEntityRef[] {
  const refs: LibraryIndexEntityRef[] = [];

  for (const project of db.projects.list()) {
    if (project.deleted_at) continue;
    refs.push({ entityType: 'project', entityId: project.id, projectId: project.id });
  }

  for (const series of db.fictionSeries.listSeries()) {
    if (series.deleted_at) continue;
    refs.push({ entityType: 'series', entityId: series.id });
    const world = db.fictionSeries.getWorldState(series.id);
    if (world?.world_knowledge_json?.trim()) {
      refs.push({ entityType: 'world', entityId: series.id });
    }
  }

  for (const project of db.projects.list()) {
    if (project.deleted_at) continue;
    for (const chapter of db.chapters.listByProject(project.id)) {
      refs.push({
        entityType: 'chapter',
        entityId: chapter.id,
        projectId: project.id,
      });
    }
    for (const character of db.characters.listByProject(project.id)) {
      refs.push({
        entityType: 'character',
        entityId: character.id,
        projectId: project.id,
      });
    }
    for (const finding of db.translationQaFindings.listByProject(project.id, { limit: 5000 })) {
      refs.push({
        entityType: 'qa_finding',
        entityId: finding.id,
        projectId: project.id,
      });
    }
    if (project.active_edition_id) {
      const editionId = project.active_edition_id;
      const chapters = db.chapters.listByProject(project.id);
      for (const chapter of chapters) {
        const paragraphs = db.paragraphs.listByChapter(chapter.id);
        for (const para of paragraphs) {
          const tr = db.translations.getByParagraphId(para.id, editionId);
          if (tr?.translated_text?.trim()) {
            refs.push({
              entityType: 'translation',
              entityId: tr.id,
              projectId: project.id,
            });
          }
        }
      }
    }
  }

  for (const term of db.terms.listAllActive()) {
    refs.push({ entityType: 'term', entityId: term.id });
  }

  return refs;
}

export function resolveResultTitle(
  db: DatabaseManager,
  entityType: LibrarySearchEntityType,
  entityId: string,
): string {
  switch (entityType) {
    case 'project': {
      const p = db.projects.getById(entityId);
      return p?.title ?? entityId;
    }
    case 'chapter': {
      const ch = db.chapters.getById(entityId);
      if (!ch) return entityId;
      return ch.display_title ?? ch.chapter_title ?? `Chapter ${ch.chapter_number ?? ''}`;
    }
    case 'term': {
      const term = db.terms.getById(entityId);
      return term?.source_text ?? term?.source_simplified ?? entityId;
    }
    case 'character': {
      const c = db.characters.getById(entityId);
      return c?.canonical_name ?? entityId;
    }
    case 'translation': {
      const tr = db.translations.getById(entityId);
      const para = tr ? db.paragraphs.getById(tr.paragraph_id) : null;
      return para?.paragraph_id ?? entityId;
    }
    case 'qa_finding': {
      const f = db.translationQaFindings.getById(entityId);
      return f ? `${f.code}: ${f.message}` : entityId;
    }
    case 'series': {
      const s = db.fictionSeries.getSeriesById(entityId);
      return s?.title ?? entityId;
    }
    case 'world': {
      const s = db.fictionSeries.getSeriesById(entityId);
      return s ? `${s.title} — world` : entityId;
    }
    default:
      return entityId;
  }
}

export function resolveResultRouteMeta(
  db: DatabaseManager,
  entityType: LibrarySearchEntityType,
  entityId: string,
  _projectId: string | null,
): { chapterId?: string | null; stableParagraphId?: string | null } {
  if (entityType === 'translation') {
    const tr = db.translations.getById(entityId);
    const para = tr ? db.paragraphs.getById(tr.paragraph_id) : null;
    return {
      chapterId: para?.chapter_id ?? null,
      stableParagraphId: para?.paragraph_id ?? null,
    };
  }
  if (entityType === 'qa_finding') {
    const f = db.translationQaFindings.getById(entityId);
    if (!f?.stable_paragraph_id) return {};
    const para = db.paragraphs.getByStableId(f.stable_paragraph_id);
    return {
      chapterId: para?.chapter_id ?? null,
      stableParagraphId: f.stable_paragraph_id,
    };
  }
  return {};
}
