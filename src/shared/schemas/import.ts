import { z } from 'zod';

export const ProjectDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  genre: z.string().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  chapterCount: z.number().int().nonnegative().optional(),
});

export type ProjectDto = z.infer<typeof ProjectDtoSchema>;

export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectDtoSchema),
});

export const ProjectCreateRequestSchema = z.object({
  title: z.string().min(1).max(500),
  genre: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
});

export const ProjectCreateResponseSchema = z.object({
  project: ProjectDtoSchema,
});

export const ProjectIdRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const ProjectDeleteResponseSchema = z.object({
  ok: z.literal(true),
});

export const ImportPreviewChapterSchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string(),
  characterCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  confidence: z.number(),
  isDuplicateTitle: z.boolean(),
  isDuplicateHash: z.boolean(),
  sourceHash: z.string(),
  previewText: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
});

export const ImportPreviewDtoSchema = z.object({
  previewId: z.string().uuid(),
  fileName: z.string(),
  format: z.enum(['txt', 'epub', 'docx']),
  encoding: z.string().optional(),
  encodingConfidence: z.number().optional(),
  overallConfidence: z.number(),
  warnings: z.array(z.string()),
  sourceHash: z.string(),
  chapterCount: z.number().int().nonnegative(),
  chapters: z.array(ImportPreviewChapterSchema),
});

export type ImportPreviewDto = z.infer<typeof ImportPreviewDtoSchema>;

export const ImportSelectFileResponseSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().nullable(),
});

export const ImportPreviewRequestSchema = z.object({
  filePath: z.string().min(1),
});

export const ImportPreviewResponseSchema = z.object({
  preview: ImportPreviewDtoSchema,
});

export const ImportUpdatePreviewRequestSchema = z.object({
  previewId: z.string().uuid(),
  redetect: z.boolean().optional(),
  manualSplits: z
    .array(
      z.object({
        offset: z.number().int().nonnegative(),
        title: z.string().min(1).max(500).optional(),
      }),
    )
    .optional(),
  chapterPatches: z
    .array(
      z.object({
        chapterNumber: z.number().int().positive(),
        title: z.string().min(1).max(500).optional(),
        include: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const ImportCommitRequestSchema = z.object({
  previewId: z.string().uuid(),
  projectTitle: z.string().min(1).max(500),
  projectId: z.string().uuid().optional(),
});

export const ImportCommitResponseSchema = z.object({
  project: ProjectDtoSchema,
  chapterCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
});

export const ImportDiscardRequestSchema = z.object({
  previewId: z.string().uuid(),
});

export const ImportDiscardResponseSchema = z.object({
  ok: z.literal(true),
});
