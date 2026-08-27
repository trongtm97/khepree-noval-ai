import { z } from 'zod';

export const EditionDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  targetLanguage: z.string(),
  name: z.string(),
  status: z.string(),
  styleConfig: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isActive: z.boolean(),
});

export type EditionDtoSchemaType = z.infer<typeof EditionDtoSchema>;

export const EditionListRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const EditionListResponseSchema = z.object({
  editions: z.array(EditionDtoSchema),
});

export const EditionCreateRequestSchema = z.object({
  projectId: z.string().uuid(),
  targetLanguage: z.string().min(2).max(32),
  name: z.string().min(1).max(200).optional(),
  activate: z.boolean().optional(),
});

export const EditionCreateResponseSchema = z.object({
  edition: EditionDtoSchema,
  editions: z.array(EditionDtoSchema),
});

export const EditionSwitchRequestSchema = z.object({
  projectId: z.string().uuid(),
  editionId: z.string().uuid(),
});

export const EditionSwitchResponseSchema = z.object({
  edition: EditionDtoSchema,
  editions: z.array(EditionDtoSchema),
});
