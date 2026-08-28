import { z } from 'zod';
import {
  GOOGLE_ACCOUNT_PLANS,
  GOOGLE_ACCOUNT_STATUSES,
} from '../constants/google-account';
import { AccountAvailabilitySchema, AccountAvailabilitySummarySchema } from './account-availability';

export const GoogleAccountDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  displayName: z.string(),
  label: z.string(),
  avatarUrl: z.string().nullable(),
  plan: z.enum(GOOGLE_ACCOUNT_PLANS),
  status: z.enum(GOOGLE_ACCOUNT_STATUSES),
  browserProfilePath: z.string(),
  lastSeenAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  notes: z.string().nullable(),
  workerEnabled: z.boolean(),
  assignedProjectIds: z.array(z.string()),
  assignedProjects: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Canonical readiness — resolved in main process. */
  availability: AccountAvailabilitySchema,
  /** Active process-aware profile lease, if any. */
  profileLease: z
    .object({
      ownerId: z.string(),
      operation: z.string(),
      label: z.string(),
      pid: z.number().int(),
      expiresAt: z.string(),
    })
    .nullable()
    .optional(),
});

export type GoogleAccountDto = z.infer<typeof GoogleAccountDtoSchema>;

export const AccountListResponseSchema = z.object({
  accounts: z.array(GoogleAccountDtoSchema),
  summary: AccountAvailabilitySummarySchema,
});

export const AccountIdRequestSchema = z.object({
  accountId: z.string().uuid(),
});

export const AccountAddRequestSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  email: z.union([z.string().email(), z.null()]).optional(),
  skipBrowser: z.boolean().optional(),
});

export const AccountRenameRequestSchema = z.object({
  accountId: z.string().uuid(),
  label: z.string().min(1).max(200),
});

export const AccountSetPlanRequestSchema = z.object({
  accountId: z.string().uuid(),
  plan: z.enum(GOOGLE_ACCOUNT_PLANS),
});

export const AccountCompleteLoginRequestSchema = z.object({
  accountId: z.string().uuid(),
  email: z.string().email().optional(),
  label: z.string().min(1).max(200).optional(),
});

export const AccountOpenBrowserRequestSchema = z.object({
  accountId: z.string().uuid(),
  target: z.enum(['gemini', 'notebook']).optional(),
});

export const AccountRemoveRequestSchema = z.object({
  accountId: z.string().uuid(),
  confirm: z.literal(true),
});

export const AccountSetNotesRequestSchema = z.object({
  accountId: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
});

export const AccountActionResponseSchema = z.object({
  account: GoogleAccountDtoSchema,
});

export const AccountTestSessionResponseSchema = z.object({
  account: GoogleAccountDtoSchema,
  usable: z.boolean(),
  email: z.string().nullable(),
  reason: z.string().optional(),
});

export const AccountRemoveResponseSchema = z.object({
  ok: z.literal(true),
});
