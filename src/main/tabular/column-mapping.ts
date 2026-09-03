export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_');
}

export function applyColumnMapping(
  row: Record<string, string>,
  mapping?: Record<string, string>,
): Record<string, string> {
  if (!mapping || Object.keys(mapping).length === 0) return row;
  const out = { ...row };
  for (const [sourceHeader, targetKey] of Object.entries(mapping)) {
    if (!targetKey.trim()) continue;
    out[targetKey] = row[sourceHeader];
  }
  return out;
}

export function headersNeedMapping(
  headers: string[],
  requiredKeys: string[],
): boolean {
  const normalized = new Set(headers.map(normalizeHeader));
  return requiredKeys.some((key) => !normalized.has(normalizeHeader(key)));
}
