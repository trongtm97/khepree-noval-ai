import { z } from 'zod';

export const PackNovelCorpusRequestSchema = z.object({
  projectId: z.string().uuid(),
  outputDir: z.string().min(1).optional(),
});

export const CorpusPartInfoSchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  wordCount: z.number().int().nonnegative(),
  byteLength: z.number().int().nonnegative(),
  chapterFrom: z.number().int(),
  chapterTo: z.number().int(),
});

export const PackNovelCorpusResponseSchema = z.object({
  outputDir: z.string(),
  parts: z.array(CorpusPartInfoSchema),
  totalWords: z.number().int().nonnegative(),
  totalChapters: z.number().int().nonnegative(),
  underSinglePartLimit: z.boolean(),
});

export const GetPreprocessPromptRequestSchema = z.object({
  projectId: z.string().uuid(),
  partFileNames: z.array(z.string()).optional(),
});

export const GetPreprocessPromptResponseSchema = z.object({
  prompt: z.string(),
  promptPath: z.string().nullable(),
  partFileNames: z.array(z.string()),
});

export const ImportPreprocessResultRequestSchema = z.object({
  projectId: z.string().uuid(),
  text: z.string().optional(),
  filePath: z.string().min(1).optional(),
  syncDrive: z.boolean().optional(),
});

export const ImportPreprocessResultResponseSchema = z.object({
  foundKeys: z.array(z.string()),
  missingKeys: z.array(z.string()),
  charactersUpserted: z.number().int().nonnegative(),
  relationshipsUpserted: z.number().int().nonnegative(),
  termCandidatesCreated: z.number().int().nonnegative(),
  message: z.string(),
});

export const SelectBackupPathResponseSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().nullable(),
});

export const RunAutoPreprocessRequestSchema = z.object({
  projectId: z.string().uuid(),
  forceFull: z.boolean().optional(),
  googleAccountId: z.string().uuid().nullable().optional(),
});

export const RunAutoPreprocessResponseSchema = z.object({
  mode: z.enum(['quick', 'full']),
  status: z.enum(['completed', 'completed_with_warnings', 'failed', 'needs_assisted']),
  message: z.string(),
  foundKeys: z.array(z.string()),
  needsAssisted: z.boolean(),
  steps: z.array(z.string()),
  accountId: z.string().uuid().nullable(),
});

export const GetAutoPreprocessProgressRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const GetAutoPreprocessProgressResponseSchema = z.object({
  projectId: z.string().uuid(),
  step: z.string().nullable(),
  message: z.string().nullable(),
  mode: z.enum(['quick', 'full']).nullable(),
  updatedAt: z.number().nullable(),
});

export const ResetAiMemoryRequestSchema = z.object({
  projectId: z.string().uuid(),
  confirm: z.literal(true),
  runInitAfter: z.boolean().optional(),
  forceFull: z.boolean().optional(),
  googleAccountId: z.string().uuid().nullable().optional(),
});

export const ResetAiMemoryResponseSchema = z.object({
  charactersDeleted: z.number().int().nonnegative(),
  relationshipsDeleted: z.number().int().nonnegative(),
  memoryEventsDeleted: z.number().int().nonnegative(),
  termCandidatesDeleted: z.number().int().nonnegative(),
  projectTermsUnlinked: z.number().int().nonnegative(),
  projectScopedTermsDeleted: z.number().int().nonnegative(),
  storyCleared: z.boolean(),
  conflictsDeleted: z.number().int().nonnegative(),
  archivesDeleted: z.number().int().nonnegative(),
  message: z.string(),
  init: RunAutoPreprocessResponseSchema.nullable().optional(),
});
