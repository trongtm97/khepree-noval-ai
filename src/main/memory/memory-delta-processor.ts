import { parseMemoryDelta, type MemoryDeltaItem } from '@shared/schemas/memory-delta';
import type { DatabaseManager } from '../db/database-manager';
import type { MemoryConflictRow } from '../db/repositories/memory-conflict-repository';
import { withTransaction } from '../db/transaction';
import {
  resolveEditionMemoryContext,
  resolveCharacterPreferredName,
  resolveRelationshipAddressTerms,
  upsertCharacterPreferredName,
  upsertRelationshipAddressTerms,
} from './edition-memory';

export interface MemoryDeltaApplyResult {
  applied: number;
  conflicts: MemoryConflictRow[];
  skipped: number;
  charactersTouched: number;
  relationshipsTouched: number;
  storyTouched: number;
  worldTouched: number;
}

function emptyApplyResult(
  partial?: Partial<MemoryDeltaApplyResult>,
): MemoryDeltaApplyResult {
  return {
    applied: 0,
    conflicts: [],
    skipped: 0,
    charactersTouched: 0,
    relationshipsTouched: 0,
    storyTouched: 0,
    worldTouched: 0,
    ...partial,
  };
}

function mergeApplyResults(
  acc: MemoryDeltaApplyResult,
  next: MemoryDeltaApplyResult,
): MemoryDeltaApplyResult {
  return {
    applied: acc.applied + next.applied,
    skipped: acc.skipped + next.skipped,
    conflicts: [...acc.conflicts, ...next.conflicts],
    charactersTouched: acc.charactersTouched + next.charactersTouched,
    relationshipsTouched: acc.relationshipsTouched + next.relationshipsTouched,
    storyTouched: acc.storyTouched + next.storyTouched,
    worldTouched: acc.worldTouched + next.worldTouched,
  };
}

function serializeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function differs(existing: string | null | undefined, proposed: string): boolean {
  const left = existing ?? '';
  return left !== '' && left !== proposed;
}

function recordConflict(
  db: DatabaseManager,
  projectId: string,
  entityType: string,
  entityId: string | null,
  fieldKey: string,
  existing: unknown,
  proposed: unknown,
): MemoryConflictRow {
  return db.memoryConflicts.create({
    project_id: projectId,
    entity_type: entityType,
    entity_id: entityId,
    field_key: fieldKey,
    existing_value: serializeValue(existing),
    proposed_value: serializeValue(proposed),
    delta_source: 'ai_delta',
  });
}

function resolveCharacter(db: DatabaseManager, projectId: string, name: string) {
  const existing = db.characters.getByName(projectId, name);
  return (
    existing ??
    db.characters.create({
      project_id: projectId,
      canonical_name: name,
    })
  );
}

export function applyMemoryDelta(
  db: DatabaseManager,
  projectId: string,
  raw: unknown,
  chapterNumber?: number,
  editionId?: string,
): MemoryDeltaApplyResult {
  const items = parseMemoryDelta(raw);
  const edition = resolveEditionMemoryContext(db, projectId, editionId);
  let result = emptyApplyResult();

  withTransaction(db.getConnection(), () => {
    for (const item of items) {
      result = mergeApplyResults(
        result,
        applyItem(db, projectId, item, chapterNumber, edition.editionId, edition.targetLanguage),
      );
    }
  });

  return result;
}

function applyItem(
  db: DatabaseManager,
  projectId: string,
  item: MemoryDeltaItem,
  chapterNumber: number | undefined,
  editionId: string,
  targetLanguage: string,
): MemoryDeltaApplyResult {
  switch (item.action) {
    case 'upsert':
      return applyUpsert(db, projectId, item, chapterNumber, editionId, targetLanguage);
    case 'delete':
      return applyDelete(db, projectId, item);
    case 'relationship':
      return applyRelationship(db, projectId, item, chapterNumber, editionId, targetLanguage);
    case 'story_state':
      return applyStoryState(db, projectId, item);
    default:
      return emptyApplyResult({ skipped: 1 });
  }
}

function applyUpsert(
  db: DatabaseManager,
  projectId: string,
  item: Extract<MemoryDeltaItem, { action: 'upsert' }>,
  chapterNumber: number | undefined,
  editionId: string,
  targetLanguage: string,
): MemoryDeltaApplyResult {
  const conflicts: MemoryConflictRow[] = [];
  const proposedValue = serializeValue(item.value);
  const existing = db.memoryEvents.getByKey(projectId, item.category, item.key);

  if (existing) {
    if (existing.locked === 1) {
      if (differs(existing.event_value, proposedValue)) {
        conflicts.push(
          recordConflict(
            db,
            projectId,
            'memory_event',
            existing.id,
            `${item.category}.${item.key}`,
            existing.event_value,
            proposedValue,
          ),
        );
      }
      return emptyApplyResult({ conflicts, skipped: 1 });
    }
    if (differs(existing.event_value, proposedValue)) {
      conflicts.push(
        recordConflict(
          db,
          projectId,
          'memory_event',
          existing.id,
          `${item.category}.${item.key}`,
          existing.event_value,
          proposedValue,
        ),
      );
      return emptyApplyResult({ conflicts, skipped: 1 });
    }
  }

  if (
    item.category === 'character' &&
    typeof item.value === 'object' &&
    !Array.isArray(item.value)
  ) {
    const characterResult = applyCharacterPatch(
      db,
      projectId,
      item.key,
      item.value,
      chapterNumber,
      editionId,
      targetLanguage,
    );
    conflicts.push(...characterResult.conflicts);
    if (characterResult.blocked) {
      return emptyApplyResult({ conflicts, skipped: 1 });
    }
  }

  db.memoryEvents.upsert({
    project_id: projectId,
    category: item.category,
    event_key: item.key,
    event_value: proposedValue,
    source: 'ai_delta',
    chapter_number: item.chapterNumber ?? chapterNumber ?? null,
  });

  const charactersTouched =
    item.category === 'character' &&
    typeof item.value === 'object' &&
    !Array.isArray(item.value)
      ? 1
      : 0;

  const worldTouched = item.category === 'world' ? 1 : 0;

  return emptyApplyResult({ applied: 1, conflicts, charactersTouched, worldTouched });
}

function applyCharacterPatch(
  db: DatabaseManager,
  projectId: string,
  name: string,
  value: Record<string, unknown>,
  chapterNumber: number | undefined,
  editionId: string,
  targetLanguage: string,
): { conflicts: MemoryConflictRow[]; blocked: boolean } {
  const conflicts: MemoryConflictRow[] = [];
  const proposedName =
    typeof value.translatedName === 'string'
      ? value.translatedName
      : typeof value.translated_name === 'string'
        ? value.translated_name
        : null;

  let character = db.characters.getByName(projectId, name);
  if (!character) {
    character = db.characters.create({
      project_id: projectId,
      canonical_name: name,
      gender: typeof value.gender === 'string' ? value.gender : null,
      role: typeof value.role === 'string' ? value.role : null,
      description: typeof value.description === 'string' ? value.description : null,
      status:
        typeof value.status === 'string'
          ? (value.status as import('@shared/constants/memory').CharacterStatus)
          : undefined,
      first_chapter: chapterNumber ?? null,
      last_chapter: chapterNumber ?? null,
    });
    if (proposedName) {
      upsertCharacterPreferredName(db, {
        characterId: character.id,
        editionId,
        targetLanguage,
        preferredName: proposedName,
        source: 'ai_delta',
      });
    }
    return { conflicts, blocked: false };
  }

  const existingTranslation = db.characterTranslations.getByCharacterAndEdition(
    character.id,
    editionId,
  );
  const existingPreferred = resolveCharacterPreferredName(db, character, editionId);

  const fields: {
    patchKey: string;
    rowKey: keyof import('../db/repositories/character-repository').CharacterRow;
    proposed: unknown;
    editionScoped?: boolean;
  }[] = [
    {
      patchKey: 'translatedName',
      rowKey: 'translated_name',
      proposed: proposedName,
      editionScoped: true,
    },
    { patchKey: 'gender', rowKey: 'gender', proposed: value.gender },
    { patchKey: 'role', rowKey: 'role', proposed: value.role },
    { patchKey: 'description', rowKey: 'description', proposed: value.description },
    { patchKey: 'status', rowKey: 'status', proposed: value.status },
  ];

  let blocked = false;
  const patch: Partial<import('../db/repositories/character-repository').CreateCharacterInput> =
    {};
  let preferredPatch: string | null | undefined;

  for (const field of fields) {
    if (field.proposed === undefined) continue;
    if (field.editionScoped) {
      if (existingTranslation?.locked === 1) {
        const proposedText = serializeValue(field.proposed);
        const existingText = serializeValue(existingPreferred);
        if (differs(existingText, proposedText)) {
          blocked = true;
          conflicts.push(
            recordConflict(
              db,
              projectId,
              'character_translation',
              existingTranslation.id,
              field.patchKey,
              existingPreferred,
              field.proposed,
            ),
          );
        }
        continue;
      }
      if (typeof field.proposed === 'string') {
        preferredPatch = field.proposed;
      }
      continue;
    }

    const existing = character[field.rowKey];
    const proposedText = serializeValue(field.proposed);
    const existingText = serializeValue(existing);
    if (differs(existingText, proposedText)) {
      blocked = true;
      conflicts.push(
        recordConflict(
          db,
          projectId,
          'character',
          character.id,
          field.patchKey,
          existing,
          field.proposed,
        ),
      );
      continue;
    }
    if (field.rowKey === 'gender' && typeof field.proposed === 'string') {
      patch.gender = field.proposed;
    }
    if (field.rowKey === 'role' && typeof field.proposed === 'string') {
      patch.role = field.proposed;
    }
    if (field.rowKey === 'description' && typeof field.proposed === 'string') {
      patch.description = field.proposed;
    }
    if (field.rowKey === 'status' && typeof field.proposed === 'string') {
      patch.status = field.proposed as import('@shared/constants/memory').CharacterStatus;
    }
  }

  if (character.locked === 1 && Object.keys(patch).length > 0) {
    return { conflicts, blocked: true };
  }

  if (!blocked && Object.keys(patch).length > 0) {
    db.characters.update(character.id, patch);
  }

  if (!blocked && preferredPatch !== undefined) {
    upsertCharacterPreferredName(db, {
      characterId: character.id,
      editionId,
      targetLanguage,
      preferredName: preferredPatch,
      source: 'ai_delta',
    });
  }

  if (chapterNumber !== undefined) {
    db.characters.touchLastChapter(character.id, chapterNumber);
  }

  return { conflicts, blocked };
}

function applyDelete(
  db: DatabaseManager,
  projectId: string,
  item: Extract<MemoryDeltaItem, { action: 'delete' }>,
): MemoryDeltaApplyResult {
  const existing = db.memoryEvents.getByKey(projectId, item.category, item.key);
  if (!existing) return emptyApplyResult({ skipped: 1 });

  if (existing.locked === 1) {
    return emptyApplyResult({
      conflicts: [
        recordConflict(
          db,
          projectId,
          'memory_event',
          existing.id,
          `${item.category}.${item.key}`,
          existing.event_value,
          null,
        ),
      ],
      skipped: 1,
    });
  }

  db.memoryEvents.deleteByKey(projectId, item.category, item.key);
  return emptyApplyResult({ applied: 1 });
}

function applyRelationship(
  db: DatabaseManager,
  projectId: string,
  item: Extract<MemoryDeltaItem, { action: 'relationship' }>,
  chapterNumber: number | undefined,
  editionId: string,
  targetLanguage: string,
): MemoryDeltaApplyResult {
  const conflicts: MemoryConflictRow[] = [];
  const fromChar = resolveCharacter(db, projectId, item.from);
  const toChar = resolveCharacter(db, projectId, item.to);

  const existingRows = db.relationships.listBetweenCharacters(
    projectId,
    fromChar.id,
    toChar.id,
  );
  const overlapping = existingRows.find((row) => {
    const from = row.valid_from_chapter ?? 0;
    const to = row.valid_to_chapter ?? Number.MAX_SAFE_INTEGER;
    const itemFrom = item.validFromChapter ?? chapterNumber ?? 0;
    const itemTo = item.validToChapter ?? Number.MAX_SAFE_INTEGER;
    return itemFrom <= to && itemTo >= from;
  });

  if (overlapping) {
    if (overlapping.locked === 1) {
      if (overlapping.relationship_type !== item.type) {
        conflicts.push(
          recordConflict(
            db,
            projectId,
            'relationship',
            overlapping.id,
            'relationship_type',
            overlapping.relationship_type,
            item.type,
          ),
        );
      }
      return emptyApplyResult({ conflicts, skipped: 1 });
    }
    if (overlapping.relationship_type !== item.type) {
      conflicts.push(
        recordConflict(
          db,
          projectId,
          'relationship',
          overlapping.id,
          'relationship_type',
          overlapping.relationship_type,
          item.type,
        ),
      );
      return emptyApplyResult({ conflicts, skipped: 1 });
    }
    const existingAddress = resolveRelationshipAddressTerms(db, overlapping, editionId);
    db.relationships.update(overlapping.id, {
      description: item.description ?? overlapping.description,
      confidence: item.confidence ?? overlapping.confidence,
      source: 'ai_delta',
    });
    upsertRelationshipAddressTerms(db, {
      relationshipId: overlapping.id,
      editionId,
      targetLanguage,
      aCallsB: item.aCallsB ?? existingAddress.aCallsB,
      bCallsA: item.bCallsA ?? existingAddress.bCallsA,
      source: 'ai_delta',
    });
    return emptyApplyResult({ applied: 1, conflicts, relationshipsTouched: 1 });
  }

  const created = db.relationships.create({
    project_id: projectId,
    from_character_id: fromChar.id,
    to_character_id: toChar.id,
    relationship_type: item.type,
    description: item.description ?? null,
    valid_from_chapter: item.validFromChapter ?? chapterNumber ?? null,
    valid_to_chapter: item.validToChapter ?? null,
    confidence: item.confidence ?? null,
    source: 'ai_delta',
  });

  upsertRelationshipAddressTerms(db, {
    relationshipId: created.id,
    editionId,
    targetLanguage,
    aCallsB: item.aCallsB ?? null,
    bCallsA: item.bCallsA ?? null,
    source: 'ai_delta',
  });

  if (chapterNumber !== undefined) {
    db.characters.touchLastChapter(fromChar.id, chapterNumber);
    db.characters.touchLastChapter(toChar.id, chapterNumber);
  }

  return emptyApplyResult({ applied: 1, conflicts, relationshipsTouched: 1 });
}

function applyStoryState(
  db: DatabaseManager,
  projectId: string,
  item: Extract<MemoryDeltaItem, { action: 'story_state' }>,
): MemoryDeltaApplyResult {
  const conflicts: MemoryConflictRow[] = [];
  const row = db.storyStates.ensure(projectId);

  if (row.locked === 1) {
    conflicts.push(
      recordConflict(db, projectId, 'story_state', row.id, 'patch', row.summary_text, item),
    );
    return emptyApplyResult({ conflicts, skipped: 1 });
  }

  const structured = db.storyStates.parseStructured(row);
  const fields: {
    key: keyof typeof structured;
    proposed: unknown;
    existing: unknown;
  }[] = [
    { key: 'summaryText', proposed: item.summaryText, existing: structured.summaryText },
    {
      key: 'cultivationState',
      proposed: item.cultivationState,
      existing: structured.cultivationState,
    },
    { key: 'locationState', proposed: item.locationState, existing: structured.locationState },
    {
      key: 'importantItems',
      proposed: item.importantItems,
      existing: structured.importantItems,
    },
    {
      key: 'unresolvedPlotPoints',
      proposed: item.unresolvedPlotPoints,
      existing: structured.unresolvedPlotPoints,
    },
  ];

  let hasConflict = false;
  for (const field of fields) {
    if (field.proposed === undefined) continue;
    const proposedStr = serializeValue(field.proposed);
    const existingStr = serializeValue(field.existing);
    if (differs(existingStr, proposedStr)) {
      hasConflict = true;
      conflicts.push(
        recordConflict(
          db,
          projectId,
          'story_state',
          row.id,
          field.key,
          field.existing,
          field.proposed,
        ),
      );
    }
  }

  if (hasConflict) {
    return emptyApplyResult({ conflicts, skipped: 1 });
  }

  db.storyStates.patch(projectId, {
    summaryText: item.summaryText,
    cultivationState: item.cultivationState,
    locationState: item.locationState,
    importantItems: item.importantItems,
    unresolvedPlotPoints: item.unresolvedPlotPoints,
    currentChapterNumber: item.currentChapterNumber,
  });

  return emptyApplyResult({ applied: 1, conflicts, storyTouched: 1 });
}
