import type { CharacterDto } from '@shared/schemas/memory';

export interface DuplicateCharacterGroup {
  id: string;
  translatedName: string;
  characters: CharacterDto[];
}

export function detectDuplicateCharacterGroups(characters: CharacterDto[]): DuplicateCharacterGroup[] {
  const byTarget = new Map<string, CharacterDto[]>();

  for (const character of characters) {
    const target = (character.preferredTargetName ?? character.translatedName ?? '').trim();
    if (!target) continue;
    const key = target.toLowerCase();
    const list = byTarget.get(key) ?? [];
    list.push(character);
    byTarget.set(key, list);
  }

  const groups: DuplicateCharacterGroup[] = [];
  for (const [key, list] of byTarget) {
    if (list.length < 2) continue;
    const sources = new Set(
      list.map((c) => (c.canonicalSourceName ?? c.canonicalName).trim().toLowerCase()),
    );
    if (sources.size < 2) continue;
    groups.push({
      id: key,
      translatedName: list[0].preferredTargetName ?? list[0].translatedName ?? key,
      characters: list,
    });
  }

  return groups;
}
