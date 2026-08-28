/** Bundled HTML guides opened in the OS browser via shell.openPath. */
export const APP_GUIDE_IDS = [] as const;

export type AppGuideId = (typeof APP_GUIDE_IDS)[number];

export const APP_GUIDE_FILES = {} as const satisfies Record<AppGuideId, string>;
