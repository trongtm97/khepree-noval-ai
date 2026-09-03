/**
 * Build a display path relative to a user-chosen root.
 * Never returns absolute paths outside root; falls back to basename.
 */
export function toSafeDisplayPath(
  rootPath: string,
  absolutePath: string,
  maxLength = 96,
): string {
  const root = normalizeSlashes(rootPath).replace(/\/+$/, '');
  const abs = normalizeSlashes(absolutePath);
  let relative: string;
  if (abs === root) {
    relative = '.';
  } else if (abs.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    relative = abs.slice(root.length + 1);
  } else {
    const parts = abs.split('/');
    relative = parts[parts.length - 1] || abs;
  }
  relative = relative.replace(/\\/g, '/');
  if (relative.length <= maxLength) return relative;
  const keep = Math.max(12, Math.floor((maxLength - 1) / 2));
  return `${relative.slice(0, keep)}…${relative.slice(-keep)}`;
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}
