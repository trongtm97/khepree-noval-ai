/** Next sequential display label: `{prefix} {n}` where n = existingCount + 1. */
export function nextSequentialDisplayName(prefix: string, existingCount: number): string {
  return `${prefix} ${existingCount + 1}`;
}
