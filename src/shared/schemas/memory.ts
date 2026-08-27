import { z } from 'zod';
import {
  CHARACTER_STATUSES,
  CONFLICT_STATUSES,
  MEMORY_EVENT_CATEGORIES,
} from '../constants/memory';

export const CharacterDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  /** Canonical name in source language (= canonicalSourceName). */
  canonicalName: z.string(),
  /** Preferred name in target language (= preferredTargetName). */
  translatedName: z.string().nullable(),
  aliases: z.array(z.string()),
  gender: z.string().nullable(),
  role: z.string().nullable(),
  description: z.string().nullable(),
  firstChapter: z.number().int().positive().nullable(),
  lastChapter: z.number().int().positive().nullable(),
  status: z.enum(CHARACTER_STATUSES),
  locked: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CharacterDto = z.infer<typeof CharacterDtoSchema> & {
  /** Alias of canonicalName. */
  canonicalSourceName?: string;
  /** Alias of translatedName. */
  preferredTargetName?: string | null;
};

export const RelationshipDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  fromCharacterId: z.string().uuid(),
  toCharacterId: z.string().uuid(),
  fromName: z.string(),
  toName: z.string(),
  relationshipType: z.string(),
  description: z.string().nullable(),
  aCallsB: z.string().nullable(),
  bCallsA: z.string().nullable(),
  validFromChapter: z.number().int().positive().nullable(),
  validToChapter: z.number().int().positive().nullable(),
  confidence: z.number().nullable(),
  source: z.string(),
  locked: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RelationshipDto = z.infer<typeof RelationshipDtoSchema>;

export const StoryStateDtoSchema = z.object({
  projectId: z.string().uuid(),
  // 0 / negative from older rows means "unset" — coerce before positive check.
  currentChapterNumber: z.preprocess(
    (value) => (typeof value === 'number' && value <= 0 ? null : value),
    z.number().int().positive().nullable(),
  ),
  summaryText: z.string().nullable(),
  cultivationState: z.record(z.unknown()).optional(),
  locationState: z.record(z.unknown()).optional(),
  importantItems: z.array(z.record(z.unknown())).optional(),
  unresolvedPlotPoints: z.array(z.string()).optional(),
  locked: z.boolean(),
  updatedAt: z.string(),
});

export type StoryStateDto = z.infer<typeof StoryStateDtoSchema>;

export const MemoryEventDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  category: z.enum(MEMORY_EVENT_CATEGORIES),
  key: z.string(),
  value: z.string().nullable(),
  source: z.string(),
  locked: z.boolean(),
  chapterNumber: z.number().int().positive().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MemoryEventDto = z.infer<typeof MemoryEventDtoSchema>;

export const MemoryConflictDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable(),
  fieldKey: z.string(),
  existingValue: z.string().nullable(),
  proposedValue: z.string().nullable(),
  deltaSource: z.string(),
  status: z.enum(CONFLICT_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MemoryConflictDto = z.infer<typeof MemoryConflictDtoSchema>;

export const MemoryContextDtoSchema = z.object({
  activeTerms: z.array(
    z.object({
      sourceText: z.string(),
      preferredTranslation: z.string().nullable(),
      type: z.string(),
      locked: z.boolean(),
    }),
  ),
  activeCharacters: z.array(CharacterDtoSchema),
  relationships: z.array(RelationshipDtoSchema),
  recentMemory: z.array(
    z.object({
      category: z.string(),
      key: z.string(),
      value: z.string().nullable(),
      chapterNumber: z.number().int().positive().nullable(),
    }),
  ),
  criticalProjectRules: z.array(z.string()),
  storyState: z
    .object({
      summaryText: z.string().nullable().optional(),
      cultivationState: z.record(z.unknown()).optional(),
      locationState: z.record(z.unknown()).optional(),
      importantItems: z.array(z.record(z.unknown())).optional(),
      unresolvedPlotPoints: z.array(z.string()).optional(),
      currentChapterNumber: z.number().int().positive().nullable().optional(),
    })
    .optional(),
  anchorChapter: z.number().int().positive(),
  recentWindow: z.object({
    fromChapter: z.number().int().positive(),
    toChapter: z.number().int().positive(),
  }),
  budget: z.object({
    limit: z.number().int().positive(),
    estimated: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
  }),
});

export type MemoryContextDto = z.infer<typeof MemoryContextDtoSchema>;

export const CharacterListRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const CharacterListResponseSchema = z.object({
  characters: z.array(CharacterDtoSchema),
});

export const CharacterUpsertRequestSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  canonicalName: z.string().min(1),
  translatedName: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional(),
  gender: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  firstChapter: z.number().int().positive().nullable().optional(),
  lastChapter: z.number().int().positive().nullable().optional(),
  status: z.enum(CHARACTER_STATUSES).optional(),
  locked: z.boolean().optional(),
});

export const CharacterUpsertResponseSchema = z.object({
  character: CharacterDtoSchema,
});

export const RelationshipListRequestSchema = z.object({
  projectId: z.string().uuid(),
  atChapter: z.number().int().positive().optional(),
});

export const RelationshipListResponseSchema = z.object({
  relationships: z.array(RelationshipDtoSchema),
});

export const RelationshipUpsertRequestSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  fromCharacterId: z.string().uuid(),
  toCharacterId: z.string().uuid(),
  relationshipType: z.string().min(1),
  description: z.string().nullable().optional(),
  aCallsB: z.string().nullable().optional(),
  bCallsA: z.string().nullable().optional(),
  validFromChapter: z.number().int().positive().nullable().optional(),
  validToChapter: z.number().int().positive().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.string().optional(),
  locked: z.boolean().optional(),
});

export const StoryStateGetRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const StoryStatePatchRequestSchema = z.object({
  projectId: z.string().uuid(),
  summaryText: z.string().nullable().optional(),
  cultivationState: z.record(z.unknown()).optional(),
  locationState: z.record(z.unknown()).optional(),
  importantItems: z.array(z.record(z.unknown())).optional(),
  unresolvedPlotPoints: z.array(z.string()).optional(),
  currentChapterNumber: z.number().int().positive().nullable().optional(),
  locked: z.boolean().optional(),
});

export const MemoryApplyDeltaRequestSchema = z.object({
  projectId: z.string().uuid(),
  delta: z.unknown(),
  chapterNumber: z.number().int().positive().optional(),
});

export const MemoryApplyDeltaResponseSchema = z.object({
  applied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  conflicts: z.array(MemoryConflictDtoSchema),
});

export const MemoryConflictListRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const MemoryConflictResolveRequestSchema = z.object({
  conflictId: z.string().uuid(),
  status: z.enum(['RESOLVED', 'DISCARDED']),
});

export const MemoryBuildContextRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterIds: z.array(z.string().uuid()).min(1),
  tokenBudget: z.number().int().positive().optional(),
  recentWindow: z.number().int().positive().optional(),
});

export const MemoryBuildContextResponseSchema = z.object({
  context: MemoryContextDtoSchema,
});
