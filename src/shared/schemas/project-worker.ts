import { z } from 'zod';
import {
  PROJECT_WORKER_PURPOSES,
  PROJECT_WORKER_SOURCES,
} from '../constants/project-worker';

export const ProjectWorkerPurposeSchema = z.enum(PROJECT_WORKER_PURPOSES);
export const ProjectWorkerSourceSchema = z.enum(PROJECT_WORKER_SOURCES);

export const ProjectWorkerResolveRequestSchema = z.object({
  projectId: z.string().uuid(),
  purpose: ProjectWorkerPurposeSchema.default('translation'),
  preferredAccountId: z.string().uuid().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
});

export type ProjectWorkerResolveRequest = z.infer<
  typeof ProjectWorkerResolveRequestSchema
>;

export const ProjectWorkerResolutionDtoSchema = z.object({
  projectId: z.string().uuid(),
  purpose: ProjectWorkerPurposeSchema,
  accountId: z.string().uuid().nullable(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  source: ProjectWorkerSourceSchema,
  hasProjectBinding: z.boolean(),
  readyFallbackUsed: z.boolean(),
});

export type ProjectWorkerResolutionDto = z.infer<
  typeof ProjectWorkerResolutionDtoSchema
>;

export const ProjectWorkerSetRequestSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid(),
  /** When true, prepare/provision Research Notebook for the new worker (optional). */
  ensureNotebook: z.boolean().optional().default(false),
});

export type ProjectWorkerSetRequest = z.infer<typeof ProjectWorkerSetRequestSchema>;

export const ProjectWorkerSetResponseSchema = z.object({
  resolution: ProjectWorkerResolutionDtoSchema,
  notebookStatus: z.string().nullable(),
  needsAssisted: z.boolean(),
  message: z.string(),
});

export type ProjectWorkerSetResponse = z.infer<typeof ProjectWorkerSetResponseSchema>;
