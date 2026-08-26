/** Bundled HTML guides opened in the OS browser via shell.openPath. */
export const APP_GUIDE_IDS = ['drive-oauth-setup'] as const;

export type AppGuideId = (typeof APP_GUIDE_IDS)[number];

export const APP_GUIDE_FILES: Record<AppGuideId, string> = {
  'drive-oauth-setup': 'drive-oauth-setup.html',
};
