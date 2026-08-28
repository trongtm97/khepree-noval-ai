import type { DatabaseManager } from '../../db/database-manager';
import type { CharacterRow } from '../../db/repositories/character-repository';
import { CHARACTER_TABULAR_WARNINGS } from '@shared/constants/character-tabular';

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v?.trim()) return v.trim();
  }
  return '';
}

export function parseDelimitedList(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[|;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

export function serializeDelimitedList(items: string[]): string {
  return items.filter(Boolean).join('|');
}

export function parseLockedFacts(metadata: string | null): string {
  if (!metadata?.trim()) return '';
  try {
    const parsed = JSON.parse(metadata) as { locked_facts?: string };
    return parsed.locked_facts ?? '';
  } catch {
    return '';
  }
}

export function buildLockedFactsMetadata(lockedFacts: string): string | null {
  if (!lockedFacts.trim()) return null;
  return JSON.stringify({ locked_facts: lockedFacts.trim() });
}

/** Exact canonical name match only — no alias guessing. */
export function findByCanonicalSourceName(
  db: DatabaseManager,
  projectId: string,
  canonicalSourceName: string,
): CharacterRow[] {
  if (!canonicalSourceName.trim()) return [];
  return db
    .getConnection()
    .prepare(`SELECT * FROM characters WHERE project_id = ? AND canonical_name = ?`)
    .all(projectId, canonicalSourceName.trim()) as CharacterRow[];
}

/** Resolve character by stable ID or exact canonical source name. */
export function resolveCharacterRef(
  db: DatabaseManager,
  projectId: string,
  characterId: string,
  canonicalSourceName: string,
): {
  character: CharacterRow | null;
  messages: string[];
} {
  const messages: string[] = [];

  if (characterId) {
    if (!isUuid(characterId)) {
      return { character: null, messages: [`Invalid character_id UUID: ${characterId}`] };
    }
    const byId = db.characters.getById(characterId);
    if (!byId) {
      messages.push(CHARACTER_TABULAR_WARNINGS.CHARACTER_NOT_FOUND);
      return { character: null, messages };
    }
    if (byId.project_id !== projectId) {
      messages.push('character_id does not belong to project');
      return { character: null, messages };
    }
    if (canonicalSourceName && canonicalSourceName !== byId.canonical_name) {
      messages.push(CHARACTER_TABULAR_WARNINGS.ID_NAME_MISMATCH);
    }
    return { character: byId, messages };
  }

  if (!canonicalSourceName) {
    messages.push('character_id or canonical_source_name required');
    return { character: null, messages };
  }

  const matches = findByCanonicalSourceName(db, projectId, canonicalSourceName);
  if (matches.length === 0) {
    return { character: null, messages };
  }
  if (matches.length > 1) {
    messages.push(CHARACTER_TABULAR_WARNINGS.AMBIGUOUS_CHARACTER);
    return { character: null, messages };
  }
  return { character: matches[0]!, messages };
}

/** Source name for relationship endpoints — canonical exact match only. */
export function resolveCharacterBySourceName(
  db: DatabaseManager,
  projectId: string,
  characterId: string,
  sourceName: string,
): {
  character: CharacterRow | null;
  messages: string[];
} {
  if (characterId) {
    return resolveCharacterRef(db, projectId, characterId, sourceName);
  }
  if (!sourceName) {
    return { character: null, messages: ['character source name or id required'] };
  }
  const matches = findByCanonicalSourceName(db, projectId, sourceName);
  const messages: string[] = [];
  if (matches.length === 0) {
    messages.push(CHARACTER_TABULAR_WARNINGS.CHARACTER_NOT_FOUND);
    return { character: null, messages };
  }
  if (matches.length > 1) {
    messages.push(CHARACTER_TABULAR_WARNINGS.AMBIGUOUS_CHARACTER);
    return { character: null, messages };
  }
  return { character: matches[0]!, messages };
}

/** Warn when preferred_name collides with another character in same edition. */
export function detectDisplayNameCollision(
  db: DatabaseManager,
  projectId: string,
  editionId: string,
  characterId: string,
  preferredName: string,
): boolean {
  if (!preferredName.trim()) return false;
  const row = db
    .getConnection()
    .prepare(
      `SELECT ct.character_id FROM character_translations ct
       INNER JOIN characters c ON c.id = ct.character_id
       WHERE c.project_id = ? AND ct.edition_id = ? AND ct.preferred_name = ?
         AND ct.character_id != ?
       LIMIT 1`,
    )
    .get(projectId, editionId, preferredName.trim(), characterId) as
    | { character_id: string }
    | undefined;
  return Boolean(row);
}

export function isLegacyCharacterHeaders(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.toLowerCase()));
  return set.has('canonical_name') && (set.has('preferred_name') || set.has('translated_name'));
}

export function isWorkbookCharacterHeaders(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.toLowerCase()));
  return set.has('canonical_source_name') || set.has('character_id');
}
