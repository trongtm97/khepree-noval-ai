import type { DatabaseManager } from '../db/database-manager';
import type { CharacterRow } from '../db/repositories/character-repository';
import type { CharacterTranslationRow } from '../db/repositories/character-translation-repository';
import type { RelationshipRow } from '../db/repositories/relationship-repository';
import type { RelationshipTranslationRow } from '../db/repositories/relationship-translation-repository';
import type { TranslationEditionRow } from '../db/repositories/translation-edition-repository';
import { ensureDefaultEdition } from '../services/edition-service';

export interface EditionMemoryContext {
  editionId: string;
  targetLanguage: string;
  edition: TranslationEditionRow;
}

export function resolveEditionMemoryContext(
  db: DatabaseManager,
  projectId: string,
  editionId?: string | null,
): EditionMemoryContext {
  if (editionId) {
    const edition = db.translationEditions.getById(editionId);
    if (!edition || edition.project_id !== projectId) {
      throw new Error(`Edition not found for project: ${editionId}`);
    }
    return {
      editionId: edition.id,
      targetLanguage: edition.target_language,
      edition,
    };
  }
  const edition = ensureDefaultEdition(db, projectId);
  return {
    editionId: edition.id,
    targetLanguage: edition.target_language,
    edition,
  };
}

export function getCharacterTranslation(
  db: DatabaseManager,
  characterId: string,
  editionId: string,
): CharacterTranslationRow | null {
  return db.characterTranslations.getByCharacterAndEdition(characterId, editionId);
}

export function resolveCharacterPreferredName(
  db: DatabaseManager,
  character: CharacterRow,
  editionId: string,
): string | null {
  const tr = getCharacterTranslation(db, character.id, editionId);
  if (tr?.preferred_name?.trim()) return tr.preferred_name;
  // Transitional fallback — legacy column until all rows migrated.
  return character.translated_name;
}

export function upsertCharacterPreferredName(
  db: DatabaseManager,
  input: {
    characterId: string;
    editionId: string;
    targetLanguage: string;
    preferredName: string | null;
    locked?: boolean;
    source?: string;
  },
): CharacterTranslationRow {
  const row = db.characterTranslations.upsert({
    character_id: input.characterId,
    edition_id: input.editionId,
    target_language: input.targetLanguage,
    preferred_name: input.preferredName,
    locked: input.locked,
    source: input.source,
  });

  const character = db.characters.getById(input.characterId);
  if (character) {
    const project = db.projects.getById(character.project_id);
    if (project?.active_edition_id === input.editionId) {
      db.characters.update(input.characterId, { translated_name: input.preferredName });
    }
  }

  return row;
}

export function resolveRelationshipAddressTerms(
  db: DatabaseManager,
  relationship: RelationshipRow,
  editionId: string,
): { aCallsB: string | null; bCallsA: string | null } {
  const tr = db.relationshipTranslations.getByRelationshipAndEdition(
    relationship.id,
    editionId,
  );
  if (tr) {
    return { aCallsB: tr.a_calls_b, bCallsA: tr.b_calls_a };
  }
  return { aCallsB: relationship.a_calls_b, bCallsA: relationship.b_calls_a };
}

export function upsertRelationshipAddressTerms(
  db: DatabaseManager,
  input: {
    relationshipId: string;
    editionId: string;
    targetLanguage: string;
    aCallsB?: string | null;
    bCallsA?: string | null;
    locked?: boolean;
    source?: string;
  },
): RelationshipTranslationRow {
  return db.relationshipTranslations.upsert({
    relationship_id: input.relationshipId,
    edition_id: input.editionId,
    target_language: input.targetLanguage,
    a_calls_b: input.aCallsB,
    b_calls_a: input.bCallsA,
    locked: input.locked,
    source: input.source,
  });
}

export function buildCharacterTranslationMap(
  db: DatabaseManager,
  projectId: string,
  editionId: string,
): Map<string, CharacterTranslationRow> {
  const rows = db.characterTranslations.listByProjectAndEdition(projectId, editionId);
  return new Map(rows.map((r) => [r.character_id, r]));
}

export function buildRelationshipTranslationMap(
  db: DatabaseManager,
  editionId: string,
): Map<string, RelationshipTranslationRow> {
  const rows = db.relationshipTranslations.listByEdition(editionId);
  return new Map(rows.map((r) => [r.relationship_id, r]));
}

export function resolveEditionFromJob(
  db: DatabaseManager,
  projectId: string,
  jobId: string,
): EditionMemoryContext {
  const job = db.jobs.getById(jobId);
  if (job?.edition_id) {
    return resolveEditionMemoryContext(db, projectId, job.edition_id);
  }
  return resolveEditionMemoryContext(db, projectId);
}
