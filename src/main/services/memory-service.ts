import type { CharacterStatus } from '@shared/constants/memory';
import { getDatabase } from '../db/connection';
import { applyMemoryDelta } from '../memory/memory-delta-processor';
import { buildMemoryContext } from '../memory/context-selector';
import {
  toCharacterDto,
  toMemoryConflictDto,
  toRelationshipDto,
  toStoryStateDto,
} from './memory-dto';
import type {
  CharacterDto,
  MemoryConflictDto,
  MemoryContextDto,
  RelationshipDto,
  StoryStateDto,
} from '@shared/schemas/memory';

export class MemoryService {
  listCharacters(projectId: string): CharacterDto[] {
    const db = getDatabase();
    return db.characters.listByProject(projectId).map((row) =>
      toCharacterDto(row, db.characters.listAliases(row.id).map((alias) => alias.alias)),
    );
  }

  upsertCharacter(input: {
    id?: string;
    projectId: string;
    canonicalName: string;
    translatedName?: string | null;
    aliases?: string[];
    gender?: string | null;
    role?: string | null;
    description?: string | null;
    firstChapter?: number | null;
    lastChapter?: number | null;
    status?: CharacterStatus;
    locked?: boolean;
  }): CharacterDto {
    const db = getDatabase();
    let row = input.id ? db.characters.getById(input.id) : null;

    if (row) {
      row =
        db.characters.update(row.id, {
          canonical_name: input.canonicalName,
          translated_name: input.translatedName,
          gender: input.gender,
          role: input.role,
          description: input.description,
          first_chapter: input.firstChapter,
          last_chapter: input.lastChapter,
          status: input.status,
          locked: input.locked,
        }) ?? row;
    } else {
      row = db.characters.create({
        project_id: input.projectId,
        canonical_name: input.canonicalName,
        translated_name: input.translatedName,
        gender: input.gender,
        role: input.role,
        description: input.description,
        first_chapter: input.firstChapter,
        last_chapter: input.lastChapter,
        status: input.status,
        locked: input.locked,
      });
    }

    if (input.aliases) {
      const existing = new Set(
        db.characters.listAliases(row.id).map((alias) => alias.alias),
      );
      for (const alias of input.aliases) {
        if (!existing.has(alias)) {
          db.characters.addAlias(row.id, alias);
        }
      }
    }

    return toCharacterDto(
      row,
      db.characters.listAliases(row.id).map((alias) => alias.alias),
    );
  }

  listRelationships(projectId: string, atChapter?: number): RelationshipDto[] {
    const db = getDatabase();
    const rows = atChapter
      ? db.relationships.listActiveAtChapter(projectId, atChapter)
      : db.relationships.listByProject(projectId);

    return rows.map((row) => {
      const from = db.characters.getById(row.from_character_id);
      const to = db.characters.getById(row.to_character_id);
      return toRelationshipDto(
        row,
        from?.canonical_name ?? row.from_character_id,
        to?.canonical_name ?? row.to_character_id,
      );
    });
  }

  upsertRelationship(input: {
    id?: string;
    projectId: string;
    fromCharacterId: string;
    toCharacterId: string;
    relationshipType: string;
    description?: string | null;
    aCallsB?: string | null;
    bCallsA?: string | null;
    validFromChapter?: number | null;
    validToChapter?: number | null;
    confidence?: number | null;
    source?: string;
    locked?: boolean;
  }): RelationshipDto {
    const db = getDatabase();
    const row = input.id
      ? db.relationships.update(input.id, {
          relationship_type: input.relationshipType,
          description: input.description,
          a_calls_b: input.aCallsB,
          b_calls_a: input.bCallsA,
          valid_from_chapter: input.validFromChapter,
          valid_to_chapter: input.validToChapter,
          confidence: input.confidence,
          source: input.source,
          locked: input.locked,
        })
      : db.relationships.create({
          project_id: input.projectId,
          from_character_id: input.fromCharacterId,
          to_character_id: input.toCharacterId,
          relationship_type: input.relationshipType,
          description: input.description,
          a_calls_b: input.aCallsB,
          b_calls_a: input.bCallsA,
          valid_from_chapter: input.validFromChapter,
          valid_to_chapter: input.validToChapter,
          confidence: input.confidence,
          source: input.source ?? 'manual',
          locked: input.locked,
        });

    if (!row) {
      throw new Error(`Relationship not found: ${input.id ?? ''}`);
    }

    const from = db.characters.getById(row.from_character_id);
    const to = db.characters.getById(row.to_character_id);
    return toRelationshipDto(
      row,
      from?.canonical_name ?? row.from_character_id,
      to?.canonical_name ?? row.to_character_id,
    );
  }

  getStoryState(projectId: string): StoryStateDto {
    const db = getDatabase();
    const row = db.storyStates.ensure(projectId);
    const structured = db.storyStates.parseStructured(row);
    return toStoryStateDto(row, structured);
  }

  patchStoryState(input: {
    projectId: string;
    summaryText?: string | null;
    cultivationState?: Record<string, unknown>;
    locationState?: Record<string, unknown>;
    importantItems?: Record<string, unknown>[];
    unresolvedPlotPoints?: string[];
    currentChapterNumber?: number | null;
    locked?: boolean;
  }): StoryStateDto {
    const db = getDatabase();
    if (input.locked !== undefined) {
      db.storyStates.lock(input.projectId, input.locked);
    }

    const hasStructuredPatch =
      input.summaryText !== undefined ||
      input.cultivationState !== undefined ||
      input.locationState !== undefined ||
      input.importantItems !== undefined ||
      input.unresolvedPlotPoints !== undefined ||
      input.currentChapterNumber !== undefined;

    const row = hasStructuredPatch
      ? db.storyStates.patch(input.projectId, {
          summaryText: input.summaryText,
          cultivationState: input.cultivationState,
          locationState: input.locationState,
          importantItems: input.importantItems,
          unresolvedPlotPoints: input.unresolvedPlotPoints,
          currentChapterNumber: input.currentChapterNumber,
        })
      : db.storyStates.ensure(input.projectId);

    const structured = db.storyStates.parseStructured(row);
    return toStoryStateDto(row, structured);
  }

  applyDelta(
    projectId: string,
    delta: unknown,
    chapterNumber?: number,
  ): { applied: number; skipped: number; conflicts: MemoryConflictDto[] } {
    const db = getDatabase();
    const result = applyMemoryDelta(db, projectId, delta, chapterNumber);
    return {
      applied: result.applied,
      skipped: result.skipped,
      conflicts: result.conflicts.map(toMemoryConflictDto),
    };
  }

  listConflicts(projectId: string): MemoryConflictDto[] {
    return getDatabase()
      .memoryConflicts.listPending(projectId)
      .map(toMemoryConflictDto);
  }

  resolveConflict(conflictId: string, status: 'RESOLVED' | 'DISCARDED'): MemoryConflictDto {
    const row = getDatabase().memoryConflicts.resolve(conflictId, status);
    if (!row) throw new Error(`Conflict not found: ${conflictId}`);
    return toMemoryConflictDto(row);
  }

  buildContext(input: {
    projectId: string;
    chapterIds: string[];
    tokenBudget?: number;
    recentWindow?: number;
  }): MemoryContextDto {
    const db = getDatabase();
    return buildMemoryContext(
      db,
      input,
      (characterId) => {
        const row = db.characters.getById(characterId);
        if (!row) return null;
        return toCharacterDto(
          row,
          db.characters.listAliases(row.id).map((alias) => alias.alias),
        );
      },
      (relationshipRow) => {
        const from = db.characters.getById(relationshipRow.from_character_id);
        const to = db.characters.getById(relationshipRow.to_character_id);
        return toRelationshipDto(
          relationshipRow,
          from?.canonical_name ?? relationshipRow.from_character_id,
          to?.canonical_name ?? relationshipRow.to_character_id,
        );
      },
    );
  }
}
