import { z } from 'zod';
import { SETUP_WIZARD_STEPS } from '@shared/constants/setup';

export const SetupWizardStepSchema = z.enum(SETUP_WIZARD_STEPS);

export const SetupStatusSchema = z.object({
  completed: z.boolean(),
  /** True when user skipped wizard to explore — not the same as completed. */
  explored: z.boolean(),
  step: SetupWizardStepSchema,
  skippedDrive: z.boolean(),
  storageRoot: z.string(),
  accountCount: z.number().int().nonnegative(),
  projectCount: z.number().int().nonnegative(),
  notebookReadyCount: z.number().int().nonnegative(),
});

export type SetupStatus = z.infer<typeof SetupStatusSchema>;

export const SetupSetStepRequestSchema = z.object({
  step: SetupWizardStepSchema,
});

export const SetupCompleteRequestSchema = z.object({
  confirm: z.literal(true),
});

export const SetupCompleteResponseSchema = z.object({
  ok: z.literal(true),
  completed: z.literal(true),
});

export const SetupSkipDriveRequestSchema = z.object({
  skip: z.boolean(),
});

export const SetupExploreRequestSchema = z.object({
  confirm: z.literal(true),
});

export const SetupExploreResponseSchema = z.object({
  ok: z.literal(true),
  explored: z.literal(true),
  completed: z.literal(false),
});

export const CheckForUpdatesResponseSchema = z.object({
  ok: z.boolean(),
  status: z.enum(['up-to-date', 'update-available', 'unavailable', 'error']),
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  message: z.string(),
  releaseNotes: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  providerId: z.string(),
  providerLabel: z.string(),
});

export type CheckForUpdatesResponse = z.infer<typeof CheckForUpdatesResponseSchema>;
