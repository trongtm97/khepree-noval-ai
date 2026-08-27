/** UI surfaces for Gemini / NotebookLM automation. */
export const UI_SURFACES = [
  'GEMINI_CHAT',
  'GEMINI_NOTEBOOK',
  'NOTEBOOKLM',
  'GOOGLE_LOGIN',
  'UNKNOWN',
] as const;

export type UiSurface = (typeof UI_SURFACES)[number];

/** Chat surfaces that share the translation composer lifecycle. */
export const CHAT_SURFACES: ReadonlySet<UiSurface> = new Set([
  'GEMINI_CHAT',
  'GEMINI_NOTEBOOK',
  'NOTEBOOKLM',
]);

/** Override file provider id preferred per surface (falls back to google-gemini). */
export function overrideProviderIdForSurface(surface: UiSurface): string {
  switch (surface) {
    case 'GEMINI_CHAT':
      return 'gemini-chat';
    case 'GEMINI_NOTEBOOK':
      return 'gemini-notebook';
    case 'NOTEBOOKLM':
      return 'notebooklm';
    default:
      return 'google-gemini';
  }
}
