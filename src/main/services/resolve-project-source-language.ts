import {
  DEFAULT_SOURCE_LANGUAGE,
  getLanguageProfile,
  hasLanguageProfile,
  normalizeLanguageCode,
} from '@shared/constants/language-profile';
import type { ProjectRow } from '../db/repositories/project-repository';

/**
 * Canonical source language for translation engine.
 * `source_language` column stores detected truth; hint is never used here.
 */
export function resolveProjectSourceLanguage(
  project: Pick<ProjectRow, 'source_language'>,
): string {
  return normalizeLanguageCode(project.source_language || DEFAULT_SOURCE_LANGUAGE);
}

export function projectSourceLanguageProfile(project: Pick<ProjectRow, 'source_language'>) {
  const code = resolveProjectSourceLanguage(project);
  const profile = getLanguageProfile(code);
  return {
    code,
    profile,
    profileMissing: !hasLanguageProfile(code),
  };
}
