/**
 * Stable natural sort for paths / titles — numeric-aware, case-insensitive.
 * Uses localeCompare with numeric + sensitivity: base for testability.
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function naturalSortStrings(values: string[]): string[] {
  return [...values].sort(naturalCompare);
}
