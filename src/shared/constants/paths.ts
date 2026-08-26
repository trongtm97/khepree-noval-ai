export const APP_PATH_KEYS = [
  'root',
  'data',
  'logs',
  'browserProfiles',
  'exports',
  'backups',
  'cache',
] as const;

export type AppPathKey = (typeof APP_PATH_KEYS)[number];

export const APP_PATH_DIRS: Record<Exclude<AppPathKey, 'root'>, string> = {
  data: 'data',
  logs: 'logs',
  browserProfiles: 'browser-profiles',
  exports: 'exports',
  backups: 'backups',
  cache: 'cache',
};
