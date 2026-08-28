import { z } from 'zod';
import {
  ACCOUNT_AVAILABILITY,
  ACCOUNT_AVAILABILITY_REASONS,
  ACCOUNT_UI_LANES,
} from '../constants/account-availability';

export const AccountActiveJobSchema = z.object({
  jobId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectName: z.string().nullable().optional(),
  chapterFrom: z.number().int().nullable().optional(),
  chapterTo: z.number().int().nullable().optional(),
  paragraphsDone: z.number().int().nullable().optional(),
  paragraphsTotal: z.number().int().nullable().optional(),
});

export type AccountActiveJob = z.infer<typeof AccountActiveJobSchema>;

export const AccountAvailabilitySchema = z.object({
  availability: z.enum(ACCOUNT_AVAILABILITY),
  uiLane: z.enum(ACCOUNT_UI_LANES),
  reasonCode: z.enum(ACCOUNT_AVAILABILITY_REASONS).nullable(),
  usableForNewJob: z.boolean(),
  schedulerEligible: z.boolean(),
  canOpenBrowser: z.boolean(),
  canPause: z.boolean(),
  canRemove: z.boolean(),
  autoRetryExpected: z.boolean(),
  activeJob: AccountActiveJobSchema.nullable().optional(),
});

export type AccountAvailabilityDto = z.infer<typeof AccountAvailabilitySchema>;

export const AccountAvailabilitySummarySchema = z.object({
  ready: z.number().int().nonnegative(),
  busy: z.number().int().nonnegative(),
  paused: z.number().int().nonnegative(),
  needsAttention: z.number().int().nonnegative(),
});

export type AccountAvailabilitySummary = z.infer<typeof AccountAvailabilitySummarySchema>;
