import { parseMemoryDelta, type MemoryDeltaItem } from '@shared/schemas/memory-delta';
import type { DatabaseManager } from '../db/database-manager';
import type { MemoryConflictRow } from '../db/repositories/memory-conflict-repository';
import { withTransaction } from '../db/transaction';

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
): MemoryDeltaApplyResult {
  const items = parseMemoryDelta(raw);
  let result = emptyApplyResult();

  withTransaction(db.getConnection(), () => {
    for (const item of items) {
      result = mergeApplyResults(result, applyItem(db, projectId, item, chapterNumber));
    }
  });

  return result;
}

function applyItem(
  db: DatabaseManager,
  projectId: string,
  item: MemoryDeltaItem,
  chapterNumber?: number,
): MemoryDeltaApplyResult {
  switch (item.action) {
    case 'upsert':
      return applyUpsert(db, projectId, item, chapterNumber);
    case 'delete':
      return applyDelete(db, projectId, item);
    case 'relationship':
      return applyRelationship(db, projectId, item, chapterNumber);
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
  chapterNumber?: number,
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
): { conflicts: MemoryConflictRow[]; blocked: boolean } {
  const conflicts: MemoryConflictRow[] = [];
  let character = db.characters.getByName(projectId, name);
  if (!character) {
    character = db.characters.create({
      project_id: projectId,
      canonical_name: name,
      translated_name:
        typeof value.translatedName === 'string'
          ? value.translatedName
          : typeof value.translated_name === 'string'
            ? value.translated_name
            : null,
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
    return { conflicts, blocked: false };
  }

  const fields: {
    patchKey: string;
    rowKey: keyof import('../db/repositories/character-repository').CharacterRow;
    proposed: unknown;
  }[] = [
    {
      patchKey: 'translatedName',
      rowKey: 'translated_name',
      proposed: value.translatedName ?? value.translated_name,
    },
    { patchKey: 'gender', rowKey: 'gender', proposed: value.gender },
    { patchKey: 'role', rowKey: 'role', proposed: value.role },
    { patchKey: 'description', rowKey: 'description', proposed: value.description },
    { patchKey: 'status', rowKey: 'status', proposed: value.status },
  ];

  let blocked = false;
  const patch: Partial<import('../db/repositories/character-repository').CreateCharacterInput> =
    {};

  for (const field of fields) {
    if (field.proposed === undefined) continue;
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
    if (field.rowKey === 'translated_name' && typeof field.proposed === 'string') {
      patch.translated_name = field.proposed;
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
  chapterNumber?: number,
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
    db.relationships.update(overlapping.id, {
      description: item.description ?? overlapping.description,
      a_calls_b: item.aCallsB ?? overlapping.a_calls_b,
      b_calls_a: item.bCallsA ?? overlapping.b_calls_a,
      confidence: item.confidence ?? overlapping.confidence,
      source: 'ai_delta',
    });
    return emptyApplyResult({ applied: 1, conflicts, relationshipsTouched: 1 });
  }

  db.relationships.create({
    project_id: projectId,
    from_character_id: fromChar.id,
    to_character_id: toChar.id,
    relationship_type: item.type,
    description: item.description ?? null,
    a_calls_b: item.aCallsB ?? null,
    b_calls_a: item.bCallsA ?? null,
    valid_from_chapter: item.validFromChapter ?? chapterNumber ?? null,
    valid_to_chapter: item.validToChapter ?? null,
    confidence: item.confidence ?? null,
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
