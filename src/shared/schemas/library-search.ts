import { z } from 'zod';
import {
  LIBRARY_SEARCH_ENTITY_TYPES,
  LIBRARY_SEARCH_INDEX_RUN_STATUSES,
} from '../constants/library-search';

export const LibrarySearchEntityTypeSchema = z.enum(LIBRARY_SEARCH_ENTITY_TYPES);

export const LibrarySearchQueryInputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  projectIds: z.array(z.string()).optional(),
  seriesIds: z.array(z.string()).optional(),
  entityTypes: z.array(LibrarySearchEntityTypeSchema).optional(),
  statuses: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  requestId: z.string().optional(),
});

export const LibrarySearchResultItemSchema = z.object({
  entityKey: z.string(),
  entityType: LibrarySearchEntityTypeSchema,
  entityId: z.string(),
  projectId: z.string().nullable(),
  seriesId: z.string().nullable(),
  projectTitle: z.string().nullable(),
  seriesTitle: z.string().nullable(),
  title: z.string(),
  snippet: z.string(),
  status: z.string().nullable(),
  language: z.string().nullable(),
  rank: z.number(),
  route: z.string(),
});

export const LibrarySearchQueryResultSchema = z.object({
  requestId: z.string(),
  items: z.array(LibrarySearchResultItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  cancelled: z.boolean().optional(),
});

export const LibrarySearchSettingsSchema = z.object({
  indexSourceText: z.boolean(),
  indexTranslationText: z.boolean(),
  lastFullReindexAt: z.string().nullable(),
});

export const LibrarySearchIndexProgressSchema = z.object({
  runId: z.string(),
  status: z.enum(LIBRARY_SEARCH_INDEX_RUN_STATUSES),
  phase: z.string().nullable(),
  entitiesDone: z.number().int(),
  entitiesTotal: z.number().int(),
  errorMessage: z.string().nullable(),
});

export type LibrarySearchQueryInput = z.infer<typeof LibrarySearchQueryInputSchema>;
export type LibrarySearchResultItemDto = z.infer<typeof LibrarySearchResultItemSchema>;
export type LibrarySearchQueryResultDto = z.infer<typeof LibrarySearchQueryResultSchema>;
export type LibrarySearchSettingsDto = z.infer<typeof LibrarySearchSettingsSchema>;
export type LibrarySearchIndexProgressDto = z.infer<typeof LibrarySearchIndexProgressSchema>;
