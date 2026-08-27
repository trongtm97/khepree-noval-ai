import type { DatabaseManager } from '../db/database-manager';
import type { TranslationEditionRow } from '../db/repositories/translation-edition-repository';
import { normalizeLanguageCode } from '@shared/constants/language-profile';
import { logger } from '../logging/logger';

export interface EditionDto {
  id: string;
  projectId: string;
  targetLanguage: string;
  name: string;
  status: string;
  styleConfig: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

function defaultEditionName(targetLanguage: string, targetTitle?: string | null): string {
  if (targetTitle?.trim()) return targetTitle.trim();
  const code = normalizeLanguageCode(targetLanguage);
  const map: Record<string, string> = {
    vi: 'Tiếng Việt',
    en: 'English',
    'en-US': 'English',
    'en-GB': 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ja: '日本語',
    ko: '한국어',
    'zh-Hans': '简体中文',
    'zh-Hant': '繁體中文',
  };
  return map[code] ?? code;
}

export function toEditionDto(
  row: TranslationEditionRow,
  activeEditionId: string | null,
): EditionDto {
  return {
    id: row.id,
    projectId: row.project_id,
    targetLanguage: row.target_language,
    name: row.name,
    status: row.status,
    styleConfig: row.style_config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: activeEditionId === row.id,
  };
}

/**
 * Ensure project has at least one edition and active_edition_id set.
 * Does NOT re-run Research / FULL preprocess.
 */
export function ensureDefaultEdition(db: DatabaseManager, projectId: string): TranslationEditionRow {
  const project = db.projects.getById(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  if (project.active_edition_id) {
    const active = db.translationEditions.getById(project.active_edition_id);
    if (active) return active;
  }

  const existing = db.translationEditions.listByProject(projectId);
  if (existing.length > 0) {
    db.projects.setActiveEditionId(projectId, existing[0].id);
    mirrorEditionOntoProject(db, projectId, existing[0]);
    return existing[0];
  }

  const edition = db.translationEditions.create({
    projectId,
    targetLanguage: project.target_language,
    name: defaultEditionName(project.target_language, project.target_title),
    styleConfig: db.projects.getStyleConfig(projectId),
  });
  db.projects.setActiveEditionId(projectId, edition.id);
  logger.info('Created default translation edition', {
    projectId,
    editionId: edition.id,
    targetLanguage: edition.target_language,
  });
  return edition;
}

export function getActiveEdition(
  db: DatabaseManager,
  projectId: string,
): TranslationEditionRow {
  return ensureDefaultEdition(db, projectId);
}

export function resolveActiveEditionId(
  db: DatabaseManager,
  projectId: string,
): string {
  return getActiveEdition(db, projectId).id;
}

/** Mirror active edition fields onto project row for legacy readers. */
export function mirrorEditionOntoProject(
  db: DatabaseManager,
  projectId: string,
  edition: TranslationEditionRow,
): void {
  const project = db.projects.getById(projectId);
  if (!project) return;
  db.projects.updateLanguages(projectId, project.source_language, edition.target_language);
  db.projects.setStyleConfig(projectId, edition.style_config);
}

export function listEditions(db: DatabaseManager, projectId: string): EditionDto[] {
  const project = db.projects.getById(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  ensureDefaultEdition(db, projectId);
  const refreshed = db.projects.getById(projectId)!;
  return db.translationEditions
    .listByProject(projectId)
    .map((row) => toEditionDto(row, refreshed.active_edition_id));
}

/**
 * Add a target-language edition. Source corpus / Research / FULL preprocess unchanged.
 */
export function createEdition(
  db: DatabaseManager,
  input: {
    projectId: string;
    targetLanguage: string;
    name?: string;
    activate?: boolean;
  },
): { edition: EditionDto; editions: EditionDto[] } {
  const project = db.projects.getById(input.projectId);
  if (!project) throw new Error(`Project not found: ${input.projectId}`);
  ensureDefaultEdition(db, input.projectId);

  const targetLanguage = normalizeLanguageCode(input.targetLanguage);
  if (targetLanguage === normalizeLanguageCode(project.source_language)) {
    throw new Error('Edition target language must differ from project source language');
  }

  const existing = db.translationEditions.getByProjectAndTarget(
    input.projectId,
    targetLanguage,
  );
  if (existing) {
    if (input.activate !== false) {
      switchEdition(db, { projectId: input.projectId, editionId: existing.id });
    }
    return {
      edition: toEditionDto(existing, db.projects.getById(input.projectId)?.active_edition_id ?? null),
      editions: listEditions(db, input.projectId),
    };
  }

  const active = getActiveEdition(db, input.projectId);
  const edition = db.translationEditions.create({
    projectId: input.projectId,
    targetLanguage,
    name: input.name?.trim() || defaultEditionName(targetLanguage),
    // Copy style as starting point; edition-specific edits diverge later.
    styleConfig: active.style_config ?? db.projects.getStyleConfig(input.projectId),
  });

  if (input.activate !== false) {
    db.projects.setActiveEditionId(input.projectId, edition.id);
    mirrorEditionOntoProject(db, input.projectId, edition);
  }

  logger.info('Created translation edition', {
    projectId: input.projectId,
    editionId: edition.id,
    targetLanguage,
  });

  const activeId = db.projects.getById(input.projectId)?.active_edition_id ?? null;
  return {
    edition: toEditionDto(edition, activeId),
    editions: listEditions(db, input.projectId),
  };
}

/** Switch active edition — never re-imports source or re-runs Research preprocess. */
export function switchEdition(
  db: DatabaseManager,
  input: { projectId: string; editionId: string },
): { edition: EditionDto; editions: EditionDto[] } {
  const project = db.projects.getById(input.projectId);
  if (!project) throw new Error(`Project not found: ${input.projectId}`);

  const edition = db.translationEditions.getById(input.editionId);
  if (!edition || edition.project_id !== input.projectId) {
    throw new Error(`Edition not found: ${input.editionId}`);
  }

  db.projects.setActiveEditionId(input.projectId, edition.id);
  mirrorEditionOntoProject(db, input.projectId, edition);

  logger.info('Switched translation edition', {
    projectId: input.projectId,
    editionId: edition.id,
    targetLanguage: edition.target_language,
  });

  return {
    edition: toEditionDto(edition, edition.id),
    editions: listEditions(db, input.projectId),
  };
}
