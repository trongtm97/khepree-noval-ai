/** Estimate-only constants for the variable-size editor virtualizer. */

const EDITOR_LINE_PX = 26;
const EDITOR_ROW_PAD_PX = 16;
const EDITOR_CHARS_PER_LINE = 42;
const EDITOR_MIN_TARGET_LINES = 2;

/** True when the row sits fully outside the viewport (scroll-into-view needed). */
export function shouldScrollActiveRow(
  rowStart: number,
  rowEnd: number,
  scrollTop: number,
  viewportHeight: number,
): boolean {
  if (viewportHeight <= 0) return false;
  return rowEnd <= scrollTop || rowStart >= scrollTop + viewportHeight;
}

/** Cheap height guess from text length. Virtualizer measures real height after mount. */
export function estimateEditorRowHeight(sourceText: string, targetText: string): number {
  const sourceLines = Math.max(1, Math.ceil(Math.max(sourceText.length, 1) / EDITOR_CHARS_PER_LINE));
  const targetLines = Math.max(
    EDITOR_MIN_TARGET_LINES,
    Math.ceil(Math.max(targetText.length, 1) / EDITOR_CHARS_PER_LINE),
  );
  return Math.max(sourceLines, targetLines) * EDITOR_LINE_PX + EDITOR_ROW_PAD_PX;
}

export function resolveDraftText(
  dirty: Record<string, string>,
  stableId: string,
  persisted: string | null,
): string {
  if (Object.hasOwn(dirty, stableId)) {
    return dirty[stableId];
  }
  return persisted ?? '';
}

export function rowsOverlap(items: { start: number; size: number }[]): boolean {
  for (let i = 1; i < items.length; i += 1) {
    const prev = items[i - 1];
    const next = items[i];
    if (next.start < prev.start + prev.size) return true;
  }
  return false;
}
