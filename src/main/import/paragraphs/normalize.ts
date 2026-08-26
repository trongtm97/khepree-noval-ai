/**
 * Whitespace normalization that preserves narrative content.
 * - Unify newlines to \n
 * - Strip BOM residue
 * - Collapse runs of spaces/tabs within a line (not across blank lines)
 * - Trim trailing spaces per line
 * - Cap consecutive blank lines at 2 (preserve paragraph breaks)
 * - Do NOT remove CJK characters, punctuation, or intentional single newlines between paragraphs
 */

export function normalizeNovelText(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '');
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/[^\S\n]+/g, ' ');
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.replace(/^\n+/, '').replace(/\n+$/, '');
}
