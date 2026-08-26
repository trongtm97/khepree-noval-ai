import { z } from 'zod';
import { MEMORY_EVENT_CATEGORIES } from '../constants/memory';

export const MemoryDeltaUpsertSchema = z.object({
  action: z.literal('upsert'),
  category: z.enum(MEMORY_EVENT_CATEGORIES),
  key: z.string().min(1).max(200),
  value: z.union([z.string(), z.record(z.unknown())]),
  chapterNumber: z.number().int().positive().optional(),
});

export const MemoryDeltaDeleteSchema = z.object({
  action: z.literal('delete'),
  category: z.string().min(1),
  key: z.string().min(1),
});

export const MemoryDeltaRelationshipSchema = z.object({
  action: z.literal('relationship'),
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  aCallsB: z.string().optional(),
  bCallsA: z.string().optional(),
  validFromChapter: z.number().int().positive().optional(),
  validToChapter: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const MemoryDeltaStoryStateSchema = z.object({
  action: z.literal('story_state'),
  summaryText: z.string().optional(),
  cultivationState: z.record(z.unknown()).optional(),
  locationState: z.record(z.unknown()).optional(),
  importantItems: z.array(z.record(z.unknown())).optional(),
  unresolvedPlotPoints: z.array(z.string()).optional(),
  currentChapterNumber: z.number().int().positive().optional(),
});

export const MemoryDeltaItemSchema = z.discriminatedUnion('action', [
  MemoryDeltaUpsertSchema,
  MemoryDeltaDeleteSchema,
  MemoryDeltaRelationshipSchema,
  MemoryDeltaStoryStateSchema,
]);

export type MemoryDeltaItem = z.infer<typeof MemoryDeltaItemSchema>;

export const MemoryDeltaSchema = z.array(MemoryDeltaItemSchema);

export function parseMemoryDelta(raw: unknown): MemoryDeltaItem[] {
  const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  return MemoryDeltaSchema.parse(parsed);
}
