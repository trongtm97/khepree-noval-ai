/**
 * Escape user input for FTS5 MATCH prefix queries (unicode61).
 */
export function prepareLibraryFtsQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tokens = trimmed
    .split(/\s+/u)
    .map((token) => token.replace(/["*()]/g, '').trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

  return tokens.map((token) => `"${token}"*`).join(' ');
}

export function entityKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export function parseEntityKey(entityKeyValue: string): { type: string; id: string } | null {
  const idx = entityKeyValue.indexOf(':');
  if (idx <= 0) return null;
  return {
    type: entityKeyValue.slice(0, idx),
    id: entityKeyValue.slice(idx + 1),
  };
}

export function joinSearchBody(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join('\n');
}
