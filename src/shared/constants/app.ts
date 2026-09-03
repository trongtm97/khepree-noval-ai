export const APP_NAME = 'Khepree Novel AI' as const;
export const APP_NAME_LINE1 = 'Khepree' as const;
export const APP_NAME_LINE2 = 'NovelAI' as const;
export const APP_ID = 'com.khepree.novelai' as const;
export const EXECUTABLE_NAME = 'KhepreeNovelAI' as const;
/** Squirrel.Windows package folder — must match `makers[].name` in forge.config.ts */
export const SQUIRREL_PACKAGE_NAME = 'KhepreeNovelAI' as const;
/** Windows taskbar / toast identity — `com.squirrel.<package-id>.<exe-name>` */
export const WINDOWS_SQUIRREL_APP_USER_MODEL_ID =
  `com.squirrel.${SQUIRREL_PACKAGE_NAME}.${EXECUTABLE_NAME}` as const;
export const APP_DATA_DIR_NAME = 'KhepreeNovelAI' as const;
export const DB_FILENAME = 'khepree-novel-ai.db' as const;
export const LOG_FILENAME = 'khepree-novel-ai.log' as const;
export const BROWSER_PROFILES_DIR = 'browser-profiles' as const;
