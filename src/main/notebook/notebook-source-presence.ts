/**
 * Ownership / presence helpers so Notebook does not keep
 * 03_CHARACTERS + 03_CHARACTERS.md + 03_CHARACTERS (1) as equal live sources.
 */

export type NotebookSourceKind = 'drive_like' | 'static_upload' | 'duplicate_artifact' | 'unknown';

export function knowledgeStem(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/\s*\(\d+\)\s*$/i, '')
    .replace(/\s+copy$/i, '')
    .replace(/\s+/g, ' ');
}

export function classifyNotebookSourcePresence(name: string): NotebookSourceKind {
  const trimmed = name.trim();
  if (/\(\d+\)\s*$/i.test(trimmed) || /\bcopy\b/i.test(trimmed)) {
    return 'duplicate_artifact';
  }
  if (/\.md$/i.test(trimmed)) {
    return 'static_upload';
  }
  // Google Docs / Drive-linked titles usually have no extension.
  if (/^\d{2}_[A-Z0-9_]+$/i.test(trimmed.replace(/\s+/g, '_'))) {
    return 'drive_like';
  }
  return 'unknown';
}

/** True when a Drive LIVE title already has a drive-like card (not merely a .md upload). */
export function hasDriveLivePresence(present: string[], expectedTitle: string): boolean {
  const stem = knowledgeStem(expectedTitle);
  return present.some((item) => {
    if (knowledgeStem(item) !== stem && !fuzzyStemMatch(item, expectedTitle)) return false;
    const kind = classifyNotebookSourcePresence(item);
    return kind === 'drive_like' || kind === 'unknown';
  });
}

/** Static / duplicate cards that share a stem with owned Drive titles. */
export function listStaticDuplicateNames(
  present: string[],
  driveTitles: string[],
): string[] {
  const stems = new Set(driveTitles.map(knowledgeStem));
  return present.filter((item) => {
    const stem = knowledgeStem(item);
    if (![...stems].some((s) => s === stem || fuzzyStemEqual(s, stem))) return false;
    const kind = classifyNotebookSourcePresence(item);
    return kind === 'static_upload' || kind === 'duplicate_artifact';
  });
}

function fuzzyStemMatch(item: string, expected: string): boolean {
  const hay = knowledgeStem(item);
  const needle = knowledgeStem(expected);
  if (hay === needle) return true;
  const core = needle.replace(/^\d+_/, '');
  if (core.length >= 6 && (hay.includes(core) || hay.includes(core.replace(/_/g, ' ')))) {
    return true;
  }
  return false;
}

function fuzzyStemEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const ac = a.replace(/^\d+_/, '');
  const bc = b.replace(/^\d+_/, '');
  return ac.length >= 6 && ac === bc;
}
