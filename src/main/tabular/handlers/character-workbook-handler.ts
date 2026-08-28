import type { CharacterWorkbookSheet } from '@shared/constants/character-tabular';
import {
  CHARACTER_TABULAR_WARNINGS,
  CHARACTER_WORKBOOK_COMMIT_ORDER,
} from '@shared/constants/character-tabular';
import type { TabularCommitContext, TabularRowValidation, TabularUndoEntry } from '../types';
import {
  buildLockedFactsMetadata,
  detectDisplayNameCollision,
  findByCanonicalSourceName,
  isUuid,
  parseDelimitedList,
  pick,
  resolveCharacterBySourceName,
  resolveCharacterRef,
} from './character-tabular-utils';

export function validateWorkbookRow(
  sheet: CharacterWorkbookSheet,
  row: Record<string, string>,
  rowIndex: number,
  ctx: TabularCommitContext,
): TabularRowValidation {
  switch (sheet) {
    case 'CHARACTERS':
      return validateCharacterRow(row, rowIndex, ctx);
    case 'CHARACTER_TRANSLATIONS':
      return validateCharacterTranslationRow(row, rowIndex, ctx);
    case 'RELATIONSHIPS':
      return validateRelationshipRow(row, rowIndex, ctx);
    case 'RELATIONSHIP_RENDERING':
      return validateRelationshipRenderingRow(row, rowIndex, ctx);
    default:
      return { status: 'error', messages: [`Unknown sheet: ${sheet}`], normalized: {} };
  }
}

export function commitWorkbookRow(
  sheet: CharacterWorkbookSheet,
  row: Record<string, string>,
  ctx: TabularCommitContext,
): { action: 'insert' | 'update' | 'skip'; undo?: TabularUndoEntry } {
  switch (sheet) {
    case 'CHARACTERS':
      return commitCharacterRow(row, ctx);
    case 'CHARACTER_TRANSLATIONS':
      return commitCharacterTranslationRow(row, ctx);
    case 'RELATIONSHIPS':
      return commitRelationshipRow(row, ctx);
    case 'RELATIONSHIP_RENDERING':
      return commitRelationshipRenderingRow(row, ctx);
    default:
      throw new Error(`Unknown sheet: ${sheet}`);
  }
}

export function workbookSheetOrder(): CharacterWorkbookSheet[] {
  return [...CHARACTER_WORKBOOK_COMMIT_ORDER];
}

function validateCharacterRow(
  row: Record<string, string>,
  _rowIndex: number,
  ctx: TabularCommitContext,
): TabularRowValidation {
  const messages: string[] = [];
  const projectId = ctx.projectId;
  if (!projectId) messages.push('projectId required');

  const characterId = pick(row, 'character_id', 'id');
  const canonicalSourceName = pick(row, 'canonical_source_name', 'canonical_name');
  if (!characterId && !canonicalSourceName) {
    return {
      status: 'error',
      messages: ['canonical_source_name is required when character_id is absent'],
      normalized: {},
    };
  }

  if (characterId && !isUuid(characterId)) {
    messages.push(`Invalid character_id UUID: ${characterId}`);
  }

  const normalized: Record<string, string> = {
    _sheet: 'CHARACTERS',
    character_id: characterId,
    canonical_source_name: canonicalSourceName,
    role: pick(row, 'role'),
    gender: pick(row, 'gender'),
    first_seen_chapter: pick(row, 'first_seen_chapter', 'first_chapter'),
    description: pick(row, 'description'),
    source_aliases: pick(row, 'source_aliases', 'aliases'),
    locked_facts: pick(row, 'locked_facts'),
  };

  if (projectId && !messages.some((m) => m.startsWith('Invalid'))) {
    const resolved = resolveCharacterRef(db(ctx), projectId, characterId, canonicalSourceName);
    messages.push(...resolved.messages);
    if (resolved.character) {
      normalized.character_id = resolved.character.id;
      normalized.canonical_source_name = resolved.character.canonical_name;
    } else if (
      !characterId &&
      canonicalSourceName &&
      !messages.includes(CHARACTER_TABULAR_WARNINGS.AMBIGUOUS_CHARACTER)
    ) {
      const dupes = findByCanonicalSourceName(db(ctx), projectId, canonicalSourceName);
      if (dupes.length > 1) {
        messages.push(CHARACTER_TABULAR_WARNINGS.AMBIGUOUS_CHARACTER);
      }
    }
  }

  return finalizeValidation(messages, normalized);
}

function validateCharacterTranslationRow(
  row: Record<string, string>,
  _rowIndex: number,
  ctx: TabularCommitContext,
): TabularRowValidation {
  const messages: string[] = [];
  const projectId = ctx.projectId;
  const editionId = pick(row, 'edition_id') || ctx.editionId || '';
  if (!projectId) messages.push('projectId required');
  if (!editionId) messages.push('edition_id required');

  const characterId = pick(row, 'character_id');
  const resolved = projectId
    ? resolveCharacterRef(db(ctx), projectId, characterId, '')
    : { character: null, messages: [] as string[] };

  if (!characterId) {
    messages.push('character_id required for CHARACTER_TRANSLATIONS');
  } else {
    messages.push(...resolved.messages);
    if (!resolved.character) {
      messages.push(CHARACTER_TABULAR_WARNINGS.CHARACTER_NOT_FOUND);
    }
  }

  const preferredName = pick(row, 'preferred_name');
  if (
    projectId &&
    editionId &&
    resolved.character &&
    preferredName &&
    detectDisplayNameCollision(
      db(ctx),
      projectId,
      editionId,
      resolved.character.id,
      preferredName,
    )
  ) {
    messages.push(CHARACTER_TABULAR_WARNINGS.DISPLAY_NAME_COLLISION);
  }

  const normalized: Record<string, string> = {
    _sheet: 'CHARACTER_TRANSLATIONS',
    character_id: resolved.character?.id ?? characterId,
    edition_id: editionId,
    target_language: pick(row, 'target_language'),
    preferred_name: preferredName,
    target_aliases: pick(row, 'target_aliases', 'aliases'),
    locked: pick(row, 'locked') === '1' || pick(row, 'locked').toLowerCase() === 'true' ? '1' : '0',
    notes: pick(row, 'notes'),
  };

  return finalizeValidation(messages, normalized);
}

function validateRelationshipRow(
  row: Record<string, string>,
  _rowIndex: number,
  ctx: TabularCommitContext,
): TabularRowValidation {
  const messages: string[] = [];
  const projectId = ctx.projectId;
  if (!projectId) messages.push('projectId required');

  const relationshipId = pick(row, 'relationship_id', 'id');
  const charAId = pick(row, 'character_a_id');
  const charASource = pick(row, 'character_a_source');
  const charBId = pick(row, 'character_b_id');
  const charBSource = pick(row, 'character_b_source');

  if (!relationshipId && !charAId && !charASource) {
    messages.push('relationship_id or character endpoints required');
  }

  let charA = null as ReturnType<typeof resolveCharacterBySourceName>['character'];
  let charB = null as ReturnType<typeof resolveCharacterBySourceName>['character'];

  if (projectId) {
    const a = resolveCharacterBySourceName(db(ctx), projectId, charAId, charASource);
    messages.push(...a.messages.map((m) => `A: ${m}`));
    charA = a.character;
    const b = resolveCharacterBySourceName(db(ctx), projectId, charBId, charBSource);
    messages.push(...b.messages.map((m) => `B: ${m}`));
    charB = b.character;
  }

  if (relationshipId && isUuid(relationshipId)) {
    const rel = db(ctx).relationships.getById(relationshipId);
    if (!rel) messages.push(CHARACTER_TABULAR_WARNINGS.RELATIONSHIP_NOT_FOUND);
    else if (rel.project_id !== projectId) messages.push('relationship_id does not belong to project');
  }

  const normalized: Record<string, string> = {
    _sheet: 'RELATIONSHIPS',
    relationship_id: relationshipId,
    character_a_id: charA?.id ?? charAId,
    character_a_source: charASource || charA?.canonical_name || '',
    character_b_id: charB?.id ?? charBId,
    character_b_source: charBSource || charB?.canonical_name || '',
    relationship_type: pick(row, 'relationship_type') || 'other',
    valid_from: pick(row, 'valid_from', 'valid_from_chapter'),
    valid_to: pick(row, 'valid_to', 'valid_to_chapter'),
    description: pick(row, 'description'),
  };

  return finalizeValidation(messages, normalized);
}

function validateRelationshipRenderingRow(
  row: Record<string, string>,
  _rowIndex: number,
  ctx: TabularCommitContext,
): TabularRowValidation {
  const messages: string[] = [];
  const editionId = pick(row, 'edition_id') || ctx.editionId || '';
  const relationshipId = pick(row, 'relationship_id');
  if (!editionId) messages.push('edition_id required');
  if (!relationshipId) messages.push('relationship_id required');
  if (relationshipId && !isUuid(relationshipId)) {
    messages.push(`Invalid relationship_id UUID: ${relationshipId}`);
  } else if (relationshipId) {
    const rel = db(ctx).relationships.getById(relationshipId);
    if (!rel) messages.push(CHARACTER_TABULAR_WARNINGS.RELATIONSHIP_NOT_FOUND);
    else if (ctx.projectId && rel.project_id !== ctx.projectId) {
      messages.push('relationship_id does not belong to project');
    }
  }

  const normalized: Record<string, string> = {
    _sheet: 'RELATIONSHIP_RENDERING',
    edition_id: editionId,
    relationship_id: relationshipId,
    a_calls_b: pick(row, 'a_calls_b'),
    b_calls_a: pick(row, 'b_calls_a'),
    notes: pick(row, 'notes'),
  };

  return finalizeValidation(messages, normalized);
}

function commitCharacterRow(
  row: Record<string, string>,
  ctx: TabularCommitContext,
): { action: 'insert' | 'update' | 'skip'; undo?: TabularUndoEntry } {
  const database = db(ctx);
  const projectId = ctx.projectId!;
  const characterId = row.character_id;
  const canonicalSourceName = row.canonical_source_name;

  let character = characterId ? database.characters.getById(characterId) : null;
  if (!character && canonicalSourceName) {
    const matches = findByCanonicalSourceName(database, projectId, canonicalSourceName);
    if (matches.length === 1) character = matches[0]!;
    if (matches.length > 1) return { action: 'skip' };
  }

  const firstChapter = row.first_seen_chapter ? Number(row.first_seen_chapter) : null;
  const sourceAliases = parseDelimitedList(row.source_aliases);
  const metadata = buildLockedFactsMetadata(row.locked_facts);

  if (character) {
    if (character.locked === 1) return { action: 'skip' };
    const priorChar = { ...character };
    const priorAliases = database.characters.listAliases(character.id);
    database.characters.update(character.id, {
      canonical_name: canonicalSourceName || character.canonical_name,
      gender: row.gender || null,
      role: row.role || null,
      description: row.description || null,
      first_chapter: Number.isFinite(firstChapter) ? firstChapter : character.first_chapter,
    });
    if (metadata !== null) {
      database.getConnection()
        .prepare(`UPDATE characters SET metadata = ? WHERE id = ?`)
        .run(metadata, character.id);
    }
    syncSourceAliases(database, character.id, sourceAliases);
    return {
      action: 'update',
      undo: {
        entityType: 'character_base',
        entityId: character.id,
        action: 'update',
        prior: { character: priorChar, aliases: priorAliases },
      },
    };
  }

  const created = database.characters.create({
    project_id: projectId,
    canonical_name: canonicalSourceName,
    gender: row.gender || null,
    role: row.role || null,
    description: row.description || null,
    first_chapter: Number.isFinite(firstChapter) ? firstChapter : null,
  });
  if (metadata) {
    database.getConnection()
      .prepare(`UPDATE characters SET metadata = ? WHERE id = ?`)
      .run(metadata, created.id);
  }
  for (const alias of sourceAliases) {
    database.characters.addAlias(created.id, alias);
  }
  return {
    action: 'insert',
    undo: { entityType: 'character_base', entityId: created.id, action: 'insert', prior: null },
  };
}

function commitCharacterTranslationRow(
  row: Record<string, string>,
  ctx: TabularCommitContext,
): { action: 'insert' | 'update' | 'skip'; undo?: TabularUndoEntry } {
  const database = db(ctx);
  const editionId = row.edition_id || ctx.editionId!;
  const edition = database.translationEditions.getById(editionId);
  if (!edition) throw new Error(`Edition not found: ${editionId}`);

  const character = database.characters.getById(row.character_id);
  if (!character) return { action: 'skip' };

  const prior = database.characterTranslations.getByCharacterAndEdition(character.id, editionId);
  const targetAliases = parseDelimitedList(row.target_aliases);
  const locked = row.locked === '1';

  if (prior?.locked === 1 && !locked) return { action: 'skip' };

  database.characterTranslations.upsert({
    character_id: character.id,
    edition_id: editionId,
    target_language: row.target_language || edition.target_language,
    preferred_name: row.preferred_name || null,
    aliases_json: targetAliases.length > 0 ? JSON.stringify(targetAliases) : null,
    notes: row.notes || null,
    locked,
    source: 'tabular_import',
  });

  return {
    action: prior ? 'update' : 'insert',
    undo: {
      entityType: 'character_translation',
      entityId: prior?.id ?? character.id,
      action: prior ? 'update' : 'insert',
      prior: prior ? { translation: prior } : null,
    },
  };
}

function commitRelationshipRow(
  row: Record<string, string>,
  ctx: TabularCommitContext,
): { action: 'insert' | 'update' | 'skip'; undo?: TabularUndoEntry } {
  const database = db(ctx);
  const projectId = ctx.projectId!;
  const charA = database.characters.getById(row.character_a_id);
  const charB = database.characters.getById(row.character_b_id);
  if (!charA || !charB) return { action: 'skip' };

  const validFrom = row.valid_from ? Number(row.valid_from) : null;
  const validTo = row.valid_to ? Number(row.valid_to) : null;
  let relationship = row.relationship_id
    ? database.relationships.getById(row.relationship_id)
    : null;

  if (!relationship) {
    const matches = database.relationships.listBetweenCharacters(
      projectId,
      charA.id,
      charB.id,
    );
    if (matches.length === 1) relationship = matches[0]!;
    if (matches.length > 1) return { action: 'skip' };
  }

  if (relationship) {
    if (relationship.locked === 1) return { action: 'skip' };
    const prior = { ...relationship };
    database.relationships.update(relationship.id, {
      relationship_type: row.relationship_type,
      description: row.description || null,
      valid_from_chapter: Number.isFinite(validFrom) ? validFrom : relationship.valid_from_chapter,
      valid_to_chapter: Number.isFinite(validTo) ? validTo : relationship.valid_to_chapter,
      source: 'tabular_import',
    });
    return {
      action: 'update',
      undo: {
        entityType: 'relationship',
        entityId: relationship.id,
        action: 'update',
        prior: { relationship: prior },
      },
    };
  }

  const created = database.relationships.create({
    project_id: projectId,
    from_character_id: charA.id,
    to_character_id: charB.id,
    relationship_type: row.relationship_type,
    description: row.description || null,
    valid_from_chapter: Number.isFinite(validFrom) ? validFrom : null,
    valid_to_chapter: Number.isFinite(validTo) ? validTo : null,
    source: 'tabular_import',
  });
  return {
    action: 'insert',
    undo: { entityType: 'relationship', entityId: created.id, action: 'insert', prior: null },
  };
}

function commitRelationshipRenderingRow(
  row: Record<string, string>,
  ctx: TabularCommitContext,
): { action: 'insert' | 'update' | 'skip'; undo?: TabularUndoEntry } {
  const database = db(ctx);
  const editionId = row.edition_id || ctx.editionId!;
  const edition = database.translationEditions.getById(editionId);
  if (!edition) throw new Error(`Edition not found: ${editionId}`);

  const relationship = database.relationships.getById(row.relationship_id);
  if (!relationship) return { action: 'skip' };

  const prior = database.relationshipTranslations.getByRelationshipAndEdition(
    relationship.id,
    editionId,
  );
  const locked = false;

  database.relationshipTranslations.upsert({
    relationship_id: relationship.id,
    edition_id: editionId,
    target_language: edition.target_language,
    a_calls_b: row.a_calls_b || null,
    b_calls_a: row.b_calls_a || null,
    notes: row.notes || null,
    locked,
    source: 'tabular_import',
  });

  return {
    action: prior ? 'update' : 'insert',
    undo: {
      entityType: 'relationship_translation',
      entityId: prior?.id ?? relationship.id,
      action: prior ? 'update' : 'insert',
      prior: prior ? { translation: prior } : null,
    },
  };
}

function syncSourceAliases(
  database: ReturnType<typeof db>,
  characterId: string,
  aliases: string[],
): void {
  const existing = new Set(
    database.characters.listAliases(characterId).map((a) => a.alias),
  );
  for (const alias of aliases) {
    if (!existing.has(alias)) database.characters.addAlias(characterId, alias);
  }
}

function finalizeValidation(
  messages: string[],
  normalized: Record<string, string>,
): TabularRowValidation {
  const blocking = messages.filter(
    (m) =>
      m.includes('required') ||
      m.startsWith('Invalid') ||
      m === CHARACTER_TABULAR_WARNINGS.AMBIGUOUS_CHARACTER ||
      m === CHARACTER_TABULAR_WARNINGS.CHARACTER_NOT_FOUND ||
      m === CHARACTER_TABULAR_WARNINGS.RELATIONSHIP_NOT_FOUND ||
      m.includes('does not belong'),
  );
  const status =
    blocking.length > 0 ? 'error' : messages.length > 0 ? 'warning' : 'valid';
  return { status, messages, normalized };
}

function db(ctx: TabularCommitContext) {
  return ctx.db;
}
