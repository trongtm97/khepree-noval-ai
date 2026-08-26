import { z } from 'zod';
import { TermCandidateDtoSchema } from './term';

export const LearningDashboardRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const LearningConflictDtoSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  fieldKey: z.string(),
  existingValue: z.string().nullable(),
  proposedValue: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
});

export const LearningPromotionDtoSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  payload: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});

export const LearningMemoryDtoSchema = z.object({
  id: z.string(),
  category: z.string(),
  key: z.string(),
  value: z.string().nullable(),
  chapterNumber: z.number().nullable(),
  updatedAt: z.string(),
});

export const LearningDashboardResponseSchema = z.object({
  projectId: z.string().uuid(),
  newTerms: z.array(TermCandidateDtoSchema),
  conflicts: z.array(LearningConflictDtoSchema),
  promotions: z.array(LearningPromotionDtoSchema),
  recentMemories: z.array(LearningMemoryDtoSchema),
  stats: z.object({
    pendingCandidates: z.number().int().nonnegative(),
    pendingConflicts: z.number().int().nonnegative(),
    archives: z.number().int().nonnegative(),
    chaptersSinceSync: z.number().int().nonnegative(),
    syncEveryNChapters: z.number().int().positive(),
  }),
});

export type LearningDashboardResponse = z.infer<typeof LearningDashboardResponseSchema>;
