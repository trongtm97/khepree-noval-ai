import { z } from 'zod';
import {
  BROWSER_ATTENTION_ACTIONS,
  BROWSER_ATTENTION_KINDS,
  BROWSER_ACCOUNT_POOL_STATES,
} from '../constants/browser-account-pool';

export const DiagnosticsFailureShotSchema = z.object({
  name: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.string(),
});

export const DiagnosticsListFailureShotsResponseSchema = z.object({
  files: z.array(DiagnosticsFailureShotSchema),
});

export const DiagnosticsDeleteFailureShotRequestSchema = z.object({
  path: z.string().min(1).max(1000),
});

export const DiagnosticsDeleteFailureShotResponseSchema = z.object({
  ok: z.boolean(),
});

export const DiagnosticsPurgeFailureShotsResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
});

export const BrowserAttentionItemSchema = z.object({
  id: z.string().uuid(),
  accountKind: z.string(),
  accountId: z.string(),
  providerId: z.string().nullable(),
  providerType: z.string().nullable(),
  kind: z.enum(BROWSER_ATTENTION_KINDS),
  poolState: z.enum(BROWSER_ACCOUNT_POOL_STATES),
  summary: z.string(),
  suggestedAction: z.enum(BROWSER_ATTENTION_ACTIONS),
  diagnosticsPath: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
});

export const BrowserAttentionListResponseSchema = z.object({
  items: z.array(BrowserAttentionItemSchema),
});

export const BrowserAttentionResolveRequestSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['RESOLVED', 'DISMISSED']).default('RESOLVED'),
});

export const BrowserAttentionResolveResponseSchema = z.object({
  ok: z.boolean(),
});
