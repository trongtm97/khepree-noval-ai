import type { CharacterRow } from '../db/repositories/character-repository';
import type { RelationshipRow } from '../db/repositories/relationship-repository';
import type { MemoryEventRow } from '../db/repositories/memory-event-repository';

export interface RelevantEntityFilterInput {
  batchText: string;
  characters: CharacterRow[];
  aliasesByCharacter: Map<string, string[]>;
  preferredNameByCharacter?: Map<string, string | null>;
  relationships: RelationshipRow[];
  memoryEvents: MemoryEventRow[];
}

export interface RelevantEntityFilterResult {
  activeCharacterIds: Set<string>;
  activeCharacters: CharacterRow[];
  activeRelationships: RelationshipRow[];
  activeMemoryEvents: MemoryEventRow[];
}

function appearsInText(text: string, needle: string): boolean {
  if (!needle.trim()) return false;
  return text.includes(needle);
}

export function filterRelevantEntities(
  input: RelevantEntityFilterInput,
): RelevantEntityFilterResult {
  const activeCharacterIds = new Set<string>();

  for (const character of input.characters) {
    if (appearsInText(input.batchText, character.canonical_name)) {
      activeCharacterIds.add(character.id);
      continue;
    }
    const preferred =
      input.preferredNameByCharacter?.get(character.id) ?? character.translated_name;
    if (preferred && appearsInText(input.batchText, preferred)) {
      activeCharacterIds.add(character.id);
      continue;
    }
    const aliases = input.aliasesByCharacter.get(character.id) ?? [];
    if (aliases.some((alias) => appearsInText(input.batchText, alias))) {
      activeCharacterIds.add(character.id);
    }
  }

  const activeCharacters = input.characters.filter((c) => activeCharacterIds.has(c.id));

  const activeRelationships = input.relationships.filter(
    (rel) =>
      activeCharacterIds.has(rel.from_character_id) &&
      activeCharacterIds.has(rel.to_character_id),
  );

  const activeMemoryEvents = input.memoryEvents.filter((event) => {
    if (appearsInText(input.batchText, event.event_key)) return true;
    if (event.event_value && appearsInText(input.batchText, event.event_value)) return true;
    if (event.category === 'character' && activeCharacterIds.size > 0) {
      return input.characters.some(
        (c) =>
          activeCharacterIds.has(c.id) &&
          (c.canonical_name === event.event_key ||
            (input.preferredNameByCharacter?.get(c.id) ?? c.translated_name) ===
              event.event_key),
      );
    }
    return false;
  });

  return {
    activeCharacterIds,
    activeCharacters,
    activeRelationships,
    activeMemoryEvents,
  };
}
