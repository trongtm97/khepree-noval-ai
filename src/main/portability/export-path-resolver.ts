import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import type { NovelExportFormat } from '@shared/constants/portability';
import type { ExportCategory } from '@shared/constants/export-settings';
import { sanitizeFilename } from '@shared/utils/sanitize-filename';
import { validateExportDirectory } from './export-directory-validator';
import { getExportSettings } from './export-settings-service';

export type ExportDirectorySource = 'project' | 'global' | 'auto_subfolder';

export interface ResolveExportDirectoryInput {
  projectId: string;
  editionId?: string | null;
}

export type ResolveExportDirectoryResult =
  | { status: 'ok'; directory: string; source: ExportDirectorySource }
  | { status: 'missing' }
  | { status: 'inaccessible'; configuredPath: string; source: ExportDirectorySource };

export interface ResolveExportPathInput extends ResolveExportDirectoryInput {
  category?: ExportCategory;
  format?: NovelExportFormat;
}

/** Resolve effective export directory: project override → global default (+ optional subfolders). */
export function resolveExportDirectory(
  db: DatabaseManager,
  input: ResolveExportDirectoryInput,
): ResolveExportDirectoryResult {
  const project = db.projects.getById(input.projectId);
  if (!project) {
    return { status: 'missing' };
  }

  const projectOverride = project.export_directory?.trim();
  if (projectOverride) {
    const validation = validateExportDirectory(projectOverride);
    if (validation.valid) {
      return {
        status: 'ok',
        directory: appendLanguageSubfolder(db, validation.path, input),
        source: 'project',
      };
    }
    return {
      status: 'inaccessible',
      configuredPath: projectOverride,
      source: 'project',
    };
  }

  const settings = getExportSettings(db);
  const globalDir = settings.defaultExportDirectory?.trim();
  if (!globalDir) {
    return { status: 'missing' };
  }

  const globalValidation = validateExportDirectory(globalDir);
  if (!globalValidation.valid) {
    return {
      status: 'inaccessible',
      configuredPath: globalDir,
      source: 'global',
    };
  }

  if (settings.autoProjectSubfolder) {
    const subDir = path.join(globalValidation.path, sanitizeFilename(project.title));
    const subValidation = validateExportDirectory(subDir, { create: true });
    if (subValidation.valid) {
      return {
        status: 'ok',
        directory: appendLanguageSubfolder(db, subValidation.path, input),
        source: 'auto_subfolder',
      };
    }
    return {
      status: 'inaccessible',
      configuredPath: subDir,
      source: 'auto_subfolder',
    };
  }

  return {
    status: 'ok',
    directory: appendLanguageSubfolder(db, globalValidation.path, input),
    source: 'global',
  };
}

/** Resolve full export path including format subfolder when configured. Category reserved for future use. */
export function resolveExportPath(
  db: DatabaseManager,
  input: ResolveExportPathInput,
): ResolveExportDirectoryResult {
  const resolved = resolveExportDirectory(db, input);
  if (resolved.status !== 'ok') {
    return resolved;
  }

  void input.category;

  const settings = getExportSettings(db);
  let dir = resolved.directory;
  if (input.format && settings.folderStructure === 'BY_FORMAT') {
    const formatDir = path.join(dir, input.format.toUpperCase());
    const validation = validateExportDirectory(formatDir, { create: true });
    if (validation.valid) {
      dir = validation.path;
    }
  }

  return { ...resolved, directory: dir };
}

function appendLanguageSubfolder(
  db: DatabaseManager,
  baseDir: string,
  input: ResolveExportDirectoryInput,
): string {
  const editions = db.translationEditions.listByProject(input.projectId);
  const active = editions.filter((e) => e.status === 'ACTIVE');
  if (active.length <= 1) {
    return baseDir;
  }

  const project = db.projects.getById(input.projectId);
  const edition =
    (input.editionId ? editions.find((e) => e.id === input.editionId) : null) ??
    active.find((e) => e.id === project?.active_edition_id) ??
    active[0];

  const langCode = edition.target_language.split('-')[0]?.toLowerCase() ?? 'unknown';
  const langDir = path.join(baseDir, langCode);
  const validation = validateExportDirectory(langDir, { create: true });
  return validation.valid ? validation.path : baseDir;
}

/** True when candidatePath is inside exportDirectory (for openExportedFile guard). */
export function isPathWithinExportDirectory(
  candidatePath: string,
  exportDirectory: string,
): boolean {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedExport = path.resolve(exportDirectory);
  const relative = path.relative(resolvedExport, resolvedCandidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
