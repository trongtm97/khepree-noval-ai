import { z } from 'zod';
import { NOTEBOOK_ASSISTED_STEPS, NOTEBOOK_STATUSES } from '../constants/notebook';
import { NOTEBOOK_ROLES } from '../constants/notebook-role';
import { KNOWLEDGE_TYPES } from '../constants/knowledge';

export const NotebookMappingDtoSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string(),
  notebookName: z.string(),
  notebookRole: z.enum(NOTEBOOK_ROLES).optional().default('RESEARCH'),
  notebookId: z.string().nullable(),
  resourceUrl: z.string().nullable(),
  status: z.string(),
  assistedStep: z.string().nullable(),
  lastError: z.string().nullable(),
  lastVerifiedAt: z.string().nullable(),
  knowledgeVersion: z.number().int().nonnegative().optional(),
  localKnowledgeVersion: z.number().int().nonnegative().optional(),
  lastSyncAt: z.string().nullable().optional(),
  lastDriveSyncAt: z.string().nullable().optional(),
});

export type NotebookMappingDto = z.infer<typeof NotebookMappingDtoSchema>;

export const NotebookProvisionRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid(),
  headless: z.boolean().optional(),
  role: z.enum(NOTEBOOK_ROLES).optional(),
});

export const NotebookResumeRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid(),
  headless: z.boolean().optional(),
  role: z.enum(NOTEBOOK_ROLES).optional(),
});

export const NotebookListRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const NotebookGetRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid(),
  role: z.enum(NOTEBOOK_ROLES).optional(),
});

export const NotebookProvisionResponseSchema = z.object({
  mapping: NotebookMappingDtoSchema,
  assisted: z.boolean(),
  message: z.string(),
});

export const NotebookListResponseSchema = z.object({
  mappings: z.array(NotebookMappingDtoSchema),
});

export const NotebookGetResponseSchema = z.object({
  mapping: NotebookMappingDtoSchema.nullable(),
});

export const NotebookHealthFileSchema = z.object({
  type: z.enum(KNOWLEDGE_TYPES),
  name: z.string(),
  dirty: z.boolean(),
  localVersion: z.number().int(),
  remoteVersion: z.number().int(),
  contentHash: z.string().nullable(),
});

export const NotebookHealthDtoSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().nullable(),
  notebookName: z.string().nullable(),
  status: z.string(),
  localVersion: z.number().int(),
  notebookVersion: z.number().int(),
  pendingKnowledgeVersion: z.number().int().nonnegative().optional().default(0),
  verifiedKnowledgeVersion: z.number().int().nonnegative().optional().default(0),
  versionProbeStatus: z
    .enum(['verified', 'mismatch', 'unverified', 'pending'])
    .optional()
    .default('pending'),
  lastSyncAt: z.string().nullable(),
  lastVerifiedAt: z.string().nullable(),
  lastDriveSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  instructionsReady: z.boolean(),
  files: z.array(NotebookHealthFileSchema),
  dirty: z.boolean(),
  usableForSlimPack: z.boolean(),
  knowledgeVerified: z.boolean().optional().default(false),
});

export type NotebookHealthDto = z.infer<typeof NotebookHealthDtoSchema>;

export const NotebookRoleHealthDtoSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().nullable(),
  role: z.string(),
  notebookName: z.string().nullable(),
  status: z.string(),
  lastVerifiedAt: z.string().nullable(),
  lastDriveSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  resourceUrl: z.string().nullable(),
});

export const NotebookDualHealthDtoSchema = z.object({
  projectId: z.string().uuid(),
  layout: z.enum(['SINGLE', 'DUAL']),
  translation: NotebookHealthDtoSchema,
  research: NotebookRoleHealthDtoSchema.nullable(),
});

export type NotebookDualHealthDto = z.infer<typeof NotebookDualHealthDtoSchema>;

export const NotebookHealthRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
  role: z.enum(NOTEBOOK_ROLES).optional(),
  dual: z.boolean().optional(),
});

export const NotebookSyncNowRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
});

export const NotebookRebuildRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const NotebookBootstrapRequestSchema = z.object({
  projectId: z.string().uuid(),
  seed: z.boolean().optional(),
});

export const NotebookBootstrapResponseSchema = z.object({
  rebuilt: z.boolean(),
  seeded: z.boolean(),
  chapterCount: z.number().int(),
  message: z.string(),
});

export const NotebookPrepareForTranslateRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid().optional().nullable(),
});

export const NotebookPrepareForTranslateResponseSchema = z.object({
  ready: z.boolean(),
  usedFallback: z.boolean(),
  message: z.string(),
  notebookStatus: z.string().nullable(),
  needsAssisted: z.boolean(),
});

export const NotebookRunBootstrapAnalysisRequestSchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(['SAFE', 'BALANCED', 'DEEP']).optional(),
  googleAccountId: z.string().uuid().optional().nullable(),
  rebootstrap: z.boolean().optional(),
});

export const NotebookBootstrapAnalysisResponseSchema = z.object({
  status: z.string(),
  throughChapter: z.number().int().nullable(),
  chapterCount: z.number().int(),
  knownTermsMatched: z.number().int(),
  charactersUpserted: z.number().int(),
  relationshipsUpserted: z.number().int(),
  termCandidatesCreated: z.number().int(),
  warnings: z.array(z.string()),
  message: z.string(),
  aiRequestCount: z.number().int(),
});

export const NotebookSkipBootstrapRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const NotebookBootstrapStatusRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const NotebookBootstrapStatusResponseSchema = z.object({
  status: z.string(),
  throughChapter: z.number().int().nullable(),
  version: z.string(),
  chapterCount: z.number().int(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  characterCount: z.number().int(),
  relationshipCount: z.number().int(),
  termCandidateCount: z.number().int(),
  hasLegacyDriveConfig: z.boolean().optional().default(false),
});

export const NotebookResearchQueryRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
  question: z.string().min(1).max(4000),
});

export const NotebookResearchQueryResponseSchema = z.object({
  status: z.literal('candidate'),
  question: z.string(),
  answer: z.string(),
  disclaimer: z.string(),
});

export const NotebookOpenResearchRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
});

export const NotebookOpenResearchResponseSchema = z.object({
  ok: z.boolean(),
  url: z.string().nullable(),
});

export const NotebookStatusEnumSchema = z.enum(NOTEBOOK_STATUSES);
export const NotebookAssistedStepEnumSchema = z.enum(NOTEBOOK_ASSISTED_STEPS);
