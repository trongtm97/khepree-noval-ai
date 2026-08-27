/** JSON string-array helpers for term variant columns (no TermRow dependency). */

export function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function stringifyJsonStringArray(values: string[]): string | null {
  const cleaned = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}
