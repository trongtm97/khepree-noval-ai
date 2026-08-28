import {
  DEFAULT_SOURCE_LANGUAGE,
  getLanguageProfile,
  hasLanguageProfile,
  isAutoLanguage,
  normalizeLanguageCode,
  type LanguageProfile,
} from '@shared/constants/language-profile';
import {
  TRANSLATION_LANGUAGE_PAIR_MISSING_MESSAGE,
  TranslationLanguagePairMissingError,
} from '@shared/constants/translation-language';
import type { DatabaseManager } from '../db/database-manager';
import type { ProjectRow } from '../db/repositories/project-repository';
import { resolveEditionMemoryContext } from '../memory/edition-memory';

export interface ResolvedTranslationLanguagePair {
  sourceLanguage: string;
  targetLanguage: string;
  sourceProfile: LanguageProfile;
  targetProfile: LanguageProfile;
  detectionConfidence?: number | null;
  editionId: string;
}

export interface ResolveForProjectEditionInput {
  projectId: string;
  editionId?: string | null;
}

/**
 * Canonical production resolver for translation prompts.
 * SOURCE: detected project source_language, else legacy-migrated default.
 * TARGET: active translation edition target_language.
 * Never reads user source hint column.
 */
export function resolveForProjectEdition(
  db: DatabaseManager,
  input: ResolveForProjectEditionInput,
): ResolvedTranslationLanguagePair {
  const project = db.projects.getById(input.projectId);
  if (!project) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const editionCtx = resolveEditionMemoryContext(db, input.projectId, input.editionId);
  const sourceLanguage = resolveProjectSourceLanguageForProduction(project);
  const targetLanguage = resolveEditionTargetLanguage(editionCtx.targetLanguage);

  if (!sourceLanguage || !targetLanguage) {
    throw new TranslationLanguagePairMissingError();
  }

  return {
    sourceLanguage,
    targetLanguage,
    sourceProfile: getLanguageProfile(sourceLanguage),
    targetProfile: getLanguageProfile(targetLanguage),
    detectionConfidence: project.source_language_confidence,
    editionId: editionCtx.editionId,
  };
}

/** Legacy zh-Hans default — only for migrated / LEGACY_IMPORT projects, not runtime safety. */
export function isLegacyLanguagePairFallbackAllowed(
  project: Pick<ProjectRow, 'source_mode'>,
): boolean {
  return project.source_mode === 'LEGACY_IMPORT';
}

function resolveCanonicalSourceLanguage(
  project: Pick<ProjectRow, 'source_language' | 'source_mode'>,
): string | null {
  const raw = project.source_language.trim();
  if (raw && !isAutoLanguage(raw)) {
    return normalizeLanguageCode(raw);
  }
  if (isLegacyLanguagePairFallbackAllowed(project)) {
    return DEFAULT_SOURCE_LANGUAGE;
  }
  return null;
}

function resolveEditionTargetLanguage(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || isAutoLanguage(trimmed)) return null;
  return normalizeLanguageCode(trimmed);
}

/**
 * Production source language — never uses user hint.
 * Throws when pair cannot be resolved for non-legacy projects.
 */
export function resolveProjectSourceLanguageForProduction(
  project: Pick<ProjectRow, 'source_language' | 'source_mode'>,
): string {
  const resolved = resolveCanonicalSourceLanguage(project);
  if (!resolved) {
    throw new TranslationLanguagePairMissingError(
      TRANSLATION_LANGUAGE_PAIR_MISSING_MESSAGE,
    );
  }
  return resolved;
}

/** Resolve pair from an already-loaded project row + edition target. */
export function resolveLanguagePairFromRows(input: {
  project: Pick<ProjectRow, 'source_language' | 'source_mode' | 'source_language_confidence'>;
  editionId: string;
  editionTargetLanguage: string;
}): ResolvedTranslationLanguagePair {
  const sourceLanguage = resolveProjectSourceLanguageForProduction(input.project);
  const targetLanguage = resolveEditionTargetLanguage(input.editionTargetLanguage);
  if (!targetLanguage) {
    throw new TranslationLanguagePairMissingError();
  }
  return {
    sourceLanguage,
    targetLanguage,
    sourceProfile: getLanguageProfile(sourceLanguage),
    targetProfile: getLanguageProfile(targetLanguage),
    detectionConfidence: input.project.source_language_confidence,
    editionId: input.editionId,
  };
}

/** Project-row source language (never uses hint). */
export function resolveProjectSourceLanguage(
  project: Pick<ProjectRow, 'source_language' | 'source_mode'>,
): string {
  return resolveProjectSourceLanguageForProduction(project);
}

export function projectSourceLanguageProfile(
  project: Pick<ProjectRow, 'source_language' | 'source_mode'>,
) {
  const code = resolveProjectSourceLanguage(project);
  const profile = getLanguageProfile(code);
  return {
    code,
    profile,
    profileMissing: !hasLanguageProfile(code),
  };
}
