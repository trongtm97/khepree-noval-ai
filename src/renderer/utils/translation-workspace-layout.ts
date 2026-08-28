/** Layout constants and helpers for translation workspace rails. */

export const CHAPTER_RAIL_MIN = 160;
export const CHAPTER_RAIL_MAX = 320;
export const CHAPTER_RAIL_DEFAULT = 185;
export const CHAPTER_RAIL_CAP_1366 = 190;
export const CHAPTER_RAIL_PREFERRED_1920 = 230;

export const CONTEXT_PANEL_MIN = 240;
export const CONTEXT_PANEL_MAX = 360;
export const CONTEXT_PANEL_DEFAULT = 260;
export const CONTEXT_PANEL_CAP_1366 = 260;

/** Below this width context opens as overlay drawer, not grid column. */
export const CONTEXT_OVERLAY_THRESHOLD = 1200;

export function clampChapterRailWidth(width: number): number {
  return Math.min(CHAPTER_RAIL_MAX, Math.max(CHAPTER_RAIL_MIN, width));
}

export function clampContextPanelWidth(width: number): number {
  return Math.min(CONTEXT_PANEL_MAX, Math.max(CONTEXT_PANEL_MIN, width));
}

/** Apply viewport caps while respecting stored preference. */
export function resolveChapterRailWidth(stored: number, viewportWidth: number): number {
  const clamped = clampChapterRailWidth(stored);
  if (viewportWidth <= 1366) return Math.min(clamped, CHAPTER_RAIL_CAP_1366);
  if (viewportWidth >= 1920) {
    return Math.min(Math.max(clamped, 210), CHAPTER_RAIL_PREFERRED_1920);
  }
  return clamped;
}

export function resolveContextPanelWidth(stored: number, viewportWidth: number): number {
  const clamped = clampContextPanelWidth(stored);
  if (viewportWidth <= 1366) return Math.min(clamped, CONTEXT_PANEL_CAP_1366);
  return clamped;
}

export function useContextOverlayMode(viewportWidth: number): boolean {
  return viewportWidth < CONTEXT_OVERLAY_THRESHOLD;
}

export function defaultChapterRailWidthForViewport(viewportWidth: number): number {
  if (viewportWidth <= 1366) return 185;
  if (viewportWidth >= 1920) return 230;
  return 200;
}
