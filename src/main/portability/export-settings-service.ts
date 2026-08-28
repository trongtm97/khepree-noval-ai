import type { DatabaseManager } from '../db/database-manager';
import {
  DEFAULT_AUTO_PROJECT_SUBFOLDER,
  DEFAULT_EXPORT_EXISTING_FILE_POLICY,
  DEFAULT_EXPORT_FOLDER_STRUCTURE,
  EXPORT_EXISTING_FILE_POLICIES,
  EXPORT_FOLDER_STRUCTURES,
  EXPORT_META_KEYS,
  type ExportExistingFilePolicy,
  type ExportFolderStructure,
} from '@shared/constants/export-settings';
import { validateExportDirectory } from './export-directory-validator';
import path from 'node:path';

export interface ExportSettings {
  defaultExportDirectory: string | null;
  autoProjectSubfolder: boolean;
  folderStructure: ExportFolderStructure;
  existingFilePolicy: ExportExistingFilePolicy;
}

export function getExportSettings(db: DatabaseManager): ExportSettings {
  const defaultExportDirectory = db.appMeta.get(EXPORT_META_KEYS.defaultDirectory)?.trim() ?? null;
  const autoRaw = db.appMeta.get(EXPORT_META_KEYS.autoProjectSubfolder);
  const folderRaw = db.appMeta.get(EXPORT_META_KEYS.folderStructure);
  const policyRaw = db.appMeta.get(EXPORT_META_KEYS.existingFilePolicy);

  return {
    defaultExportDirectory,
    autoProjectSubfolder:
      autoRaw == null ? DEFAULT_AUTO_PROJECT_SUBFOLDER : autoRaw === 'true',
    folderStructure:
      folderRaw && (EXPORT_FOLDER_STRUCTURES as readonly string[]).includes(folderRaw)
        ? (folderRaw as ExportFolderStructure)
        : DEFAULT_EXPORT_FOLDER_STRUCTURE,
    existingFilePolicy:
      policyRaw && (EXPORT_EXISTING_FILE_POLICIES as readonly string[]).includes(policyRaw)
        ? (policyRaw as ExportExistingFilePolicy)
        : DEFAULT_EXPORT_EXISTING_FILE_POLICY,
  };
}

export function setDefaultExportDirectory(
  db: DatabaseManager,
  directory: string | null,
): string | null {
  if (directory == null || directory.trim() === '') {
    db.appMeta.delete(EXPORT_META_KEYS.defaultDirectory);
    return null;
  }
  const normalized = path.resolve(directory.trim());
  const validation = validateExportDirectory(normalized, { create: true });
  if (!validation.valid) {
    throw new Error(`Invalid export directory: ${validation.error ?? 'INACCESSIBLE'}`);
  }
  db.appMeta.set(EXPORT_META_KEYS.defaultDirectory, validation.path);
  return validation.path;
}

export function setAutoProjectSubfolder(db: DatabaseManager, enabled: boolean): void {
  db.appMeta.set(EXPORT_META_KEYS.autoProjectSubfolder, enabled ? 'true' : 'false');
}

export function setExportFolderStructure(
  db: DatabaseManager,
  structure: ExportFolderStructure,
): void {
  db.appMeta.set(EXPORT_META_KEYS.folderStructure, structure);
}

export function setExistingFilePolicy(
  db: DatabaseManager,
  policy: ExportExistingFilePolicy,
): void {
  db.appMeta.set(EXPORT_META_KEYS.existingFilePolicy, policy);
}

export function getDefaultExportDirectoryInfo(db: DatabaseManager): {
  directory: string | null;
  isConfigured: boolean;
} {
  const settings = getExportSettings(db);
  return {
    directory: settings.defaultExportDirectory,
    isConfigured: settings.defaultExportDirectory != null,
  };
}
