/** Global export directory settings stored in app_meta. */
export const EXPORT_META_KEYS = {
  defaultDirectory: 'export.defaultDirectory',
  autoProjectSubfolder: 'export.autoProjectSubfolder',
  folderStructure: 'export.folderStructure',
  existingFilePolicy: 'export.existingFilePolicy',
} as const;

export const EXPORT_FOLDER_STRUCTURES = ['FLAT', 'BY_FORMAT'] as const;
export type ExportFolderStructure = (typeof EXPORT_FOLDER_STRUCTURES)[number];

export const EXPORT_EXISTING_FILE_POLICIES = ['OVERWRITE', 'ASK', 'KEEP_BOTH'] as const;
export type ExportExistingFilePolicy = (typeof EXPORT_EXISTING_FILE_POLICIES)[number];

export const EXPORT_CATEGORIES = ['CHAPTER', 'BOOK', 'DATA', 'BACKUP'] as const;
export type ExportCategory = (typeof EXPORT_CATEGORIES)[number];

export const DEFAULT_EXPORT_FOLDER_STRUCTURE: ExportFolderStructure = 'FLAT';
export const DEFAULT_EXPORT_EXISTING_FILE_POLICY: ExportExistingFilePolicy = 'OVERWRITE';
export const DEFAULT_AUTO_PROJECT_SUBFOLDER = true;

/** Persist scope when user picks folder on first export. */
export const EXPORT_DIRECTORY_SCOPES = ['project', 'global'] as const;
export type ExportDirectoryScope = (typeof EXPORT_DIRECTORY_SCOPES)[number];
