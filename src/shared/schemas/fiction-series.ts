import { z } from 'zod';

export const FictionSeriesDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  genre: z.string().max(100).nullable(),
  volumeCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const FictionSeriesVolumeDtoSchema = z.object({
  id: z.string().uuid(),
  seriesId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectTitle: z.string(),
  volumeOrder: z.number().int(),
  volumeLabel: z.string().max(120).nullable(),
});

export const SeriesMembershipConflictSchema = z.object({
  sourceText: z.string(),
  projectTranslation: z.string().nullable(),
  seriesTranslation: z.string().nullable(),
  projectTermId: z.string().uuid(),
  seriesTermId: z.string().uuid(),
  projectLocked: z.boolean(),
  seriesLocked: z.boolean(),
});

export const SeriesMembershipConflictPreviewSchema = z.object({
  projectId: z.string().uuid(),
  fromSeriesId: z.string().uuid().nullable(),
  toSeriesId: z.string().uuid(),
  conflicts: z.array(SeriesMembershipConflictSchema),
});

export const CreateFictionSeriesRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  genre: z.string().max(100).optional().nullable(),
});

export const AddSeriesVolumeRequestSchema = z.object({
  seriesId: z.string().uuid(),
  projectId: z.string().uuid(),
  volumeOrder: z.number().int().positive().optional(),
  volumeLabel: z.string().max(120).optional().nullable(),
  force: z.boolean().optional(),
});

export const PreviewSeriesMembershipRequestSchema = z.object({
  projectId: z.string().uuid(),
  toSeriesId: z.string().uuid(),
});

export const RemoveSeriesVolumeRequestSchema = z.object({
  seriesId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export const ReorderSeriesVolumesRequestSchema = z.object({
  seriesId: z.string().uuid(),
  orderedProjectIds: z.array(z.string().uuid()).min(1),
});

export const ExportSeriesKnowledgeRequestSchema = z.object({
  seriesId: z.string().uuid(),
});

export const ExportSeriesKnowledgeResponseSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('khepree-series-knowledge'),
  series: FictionSeriesDtoSchema,
  volumes: z.array(FictionSeriesVolumeDtoSchema),
  terms: z.array(
    z.object({
      id: z.string().uuid(),
      scope: z.string(),
      sourceText: z.string(),
      translations: z.array(z.string()),
      termType: z.string(),
      locked: z.boolean(),
    }),
  ),
  styleRules: z.array(z.object({ kind: z.string(), content: z.string() })),
  worldKnowledge: z.record(z.unknown()).nullable(),
});

export const UpdateFictionSeriesRequestSchema = z.object({
  seriesId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  genre: z.string().max(100).optional().nullable(),
});

export const GetSeriesWorldRequestSchema = z.object({
  seriesId: z.string().uuid(),
});

export const SetSeriesWorldRequestSchema = z.object({
  seriesId: z.string().uuid(),
  worldKnowledge: z.record(z.unknown()),
});

export const ListSeriesStyleRulesRequestSchema = z.object({
  seriesId: z.string().uuid(),
});

export const UpsertSeriesStyleRuleRequestSchema = z.object({
  seriesId: z.string().uuid(),
  id: z.string().uuid().optional(),
  kind: z.enum(['critical', 'style', 'pronoun', 'address']).or(z.string().min(1).max(40)),
  content: z.string().min(1).max(4000),
  sortOrder: z.number().int().optional(),
});

export const DeleteSeriesStyleRuleRequestSchema = z.object({
  seriesId: z.string().uuid(),
  ruleId: z.string().uuid(),
});

export const SeriesStyleRuleDtoSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  content: z.string(),
  sortOrder: z.number().int(),
});

export const ListSeriesStyleRulesResponseSchema = z.object({
  rules: z.array(SeriesStyleRuleDtoSchema),
});

export const UpsertSeriesStyleRuleResponseSchema = z.object({
  rule: SeriesStyleRuleDtoSchema,
});
