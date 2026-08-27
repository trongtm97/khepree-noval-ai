/** Google Cloud Console deep links for Desktop OAuth setup. */
export const GOOGLE_CLOUD_CONSOLE_URL = 'https://console.cloud.google.com/';
export const GOOGLE_CLOUD_CREDENTIALS_URL =
  'https://console.cloud.google.com/apis/credentials';

/**
 * Fixed loopback port for Drive OAuth.
 * Desktop clients accept any 127.0.0.1 port; Web clients must register this exact URI.
 * Format must be `http://127.0.0.1:PORT` (no path) — Google loopback spec.
 */
export const DRIVE_OAUTH_LOOPBACK_PORT = 18766;

export const DRIVE_OAUTH_REDIRECT_URI = `http://127.0.0.1:${DRIVE_OAUTH_LOOPBACK_PORT}`;

/** Google Drive OAuth scope — least privilege: app-created files only. */
export const DRIVE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const DRIVE_OAUTH_SCOPES = [DRIVE_OAUTH_SCOPE] as const;

/** Root folder name on Drive. */
export const DRIVE_ROOT_FOLDER_NAME = 'NovelTrans';

/** Owned markdown files under each project folder (Notebook knowledge layer). */
export const DRIVE_PROJECT_FILES = [
  '00_BOOK_PROFILE.md',
  '01_TRANSLATION_RULES.md',
  '02_PROJECT_TERMS.md',
  '03_CHARACTERS.md',
  '04_RELATIONSHIPS.md',
  '05_STORY_STATE.md',
  '06_WORLD_KNOWLEDGE.md',
  '07_RECENT_CONTEXT.md',
  '08_SYNC_STATE.md',
] as const;

export type DriveProjectFileName = (typeof DRIVE_PROJECT_FILES)[number];

export const DRIVE_SOURCES_FOLDER = 'sources';

/** Resource keys stored in drive_resources.resource_key */
export const DRIVE_RESOURCE_KEYS = {
  NOVELTRANS_ROOT: 'noveltrans_root',
  PROJECT_FOLDER: 'project_folder',
  SOURCES_FOLDER: 'sources_folder',
  BOOK_PROFILE_MD: '00_BOOK_PROFILE.md',
  RULES_MD: '01_TRANSLATION_RULES.md',
  PROJECT_TERMS_MD: '02_PROJECT_TERMS.md',
  CHARACTERS_MD: '03_CHARACTERS.md',
  RELATIONSHIPS_MD: '04_RELATIONSHIPS.md',
  STORY_STATE_MD: '05_STORY_STATE.md',
  WORLD_KNOWLEDGE_MD: '06_WORLD_KNOWLEDGE.md',
  RECENT_CONTEXT_MD: '07_RECENT_CONTEXT.md',
  SYNC_STATE_MD: '08_SYNC_STATE.md',
} as const;

export type DriveResourceKey = (typeof DRIVE_RESOURCE_KEYS)[keyof typeof DRIVE_RESOURCE_KEYS];

export const DRIVE_SYNC_STATUSES = [
  'idle',
  'syncing',
  'synced',
  'pending',
  'error',
  'auth_required',
] as const;

export type DriveSyncStatus = (typeof DRIVE_SYNC_STATUSES)[number];

/** Default memory sync interval (chapters). */
export const DEFAULT_DRIVE_SYNC_EVERY_N_CHAPTERS = 10;

/** Secret keys — never expose to renderer. */
export const DRIVE_SECRET_KEYS = {
  oauthClient: 'app:google_oauth_client',
  refreshToken: (accountId: string) => `oauth:drive:refresh:${accountId}`,
  accessToken: (accountId: string) => `oauth:drive:access:${accountId}`,
  tokenMeta: (accountId: string) => `oauth:drive:meta:${accountId}`,
} as const;
