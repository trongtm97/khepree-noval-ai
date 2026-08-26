import type { CharacterRow } from '../db/repositories/character-repository';
import type { RelationshipRow } from '../db/repositories/relationship-repository';
import type { StoryStateRow } from '../db/repositories/story-state-repository';
import type { MemoryEventRow } from '../db/repositories/memory-event-repository';
import type { MemoryConflictRow } from '../db/repositories/memory-conflict-repository';
import type {
  CharacterDto,
  MemoryConflictDto,
  MemoryEventDto,
  RelationshipDto,
  StoryStateDto,
} from '@shared/schemas/memory';
import type { CharacterStatus } from '@shared/constants/memory';
import { CHARACTER_STATUSES } from '@shared/constants/memory';

function asCharacterStatus(value: string): CharacterStatus {
  return (CHARACTER_STATUSES as readonly string[]).includes(value)
    ? (value as CharacterStatus)
    : 'unknown';
}

export function toCharacterDto(
  row: CharacterRow,
  aliases: string[] = [],
): CharacterDto {
  return {
    id: row.id,
    projectId: row.project_id,
    canonicalName: row.canonical_name,
    translatedName: row.translated_name,
    aliases,
    gender: row.gender,
    role: row.role,
    description: row.description,
    firstChapter: row.first_chapter,
    lastChapter: row.last_chapter,
    status: asCharacterStatus(row.status),
    locked: row.locked === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toRelationshipDto(
  row: RelationshipRow,
  fromName: string,
  toName: string,
): RelationshipDto {
  return {
    id: row.id,
    projectId: row.project_id,
    fromCharacterId: row.from_character_id,
    toCharacterId: row.to_character_id,
    fromName,
    toName,
    relationshipType: row.relationship_type,
    description: row.description,
    aCallsB: row.a_calls_b,
    bCallsA: row.b_calls_a,
    validFromChapter: row.valid_from_chapter,
    validToChapter: row.valid_to_chapter,
    confidence: row.confidence,
    source: row.source,
    locked: row.locked === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeStoryChapterNumber(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

export function toStoryStateDto(row: StoryStateRow, structured: {
  summaryText?: string | null;
  cultivationState?: Record<string, unknown>;
  locationState?: Record<string, unknown>;
  importantItems?: Record<string, unknown>[];
  unresolvedPlotPoints?: string[];
  currentChapterNumber?: number | null;
}): StoryStateDto {
  return {
    projectId: row.project_id,
    currentChapterNumber: normalizeStoryChapterNumber(
      structured.currentChapterNumber ?? row.current_chapter_number,
    ),
    summaryText: structured.summaryText ?? row.summary_text,
    cultivationState: structured.cultivationState,
    locationState: structured.locationState,
    importantItems: structured.importantItems,
    unresolvedPlotPoints: structured.unresolvedPlotPoints,
    locked: row.locked === 1,
    updatedAt: row.updated_at,
  };
}

export function toMemoryEventDto(row: MemoryEventRow): MemoryEventDto {
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category as MemoryEventDto['category'],
    key: row.event_key,
    value: row.event_value,
    source: row.source,
    locked: row.locked === 1,
    chapterNumber: row.chapter_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toMemoryConflictDto(row: MemoryConflictRow): MemoryConflictDto {
  return {
    id: row.id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fieldKey: row.field_key,
    existingValue: row.existing_value,
    proposedValue: row.proposed_value,
    deltaSource: row.delta_source,
    status: row.status as MemoryConflictDto['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
