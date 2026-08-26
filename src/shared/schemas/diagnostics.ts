import { z } from 'zod';
import { AUTOMATION_PROVIDERS } from '@shared/constants/diagnostics';
import { SelectorStrategyOverrideSchema } from './selector-override';

export const AutomationProviderIdSchema = z.enum(AUTOMATION_PROVIDERS);

export const ProviderStatusSchema = z.object({
  providerId: AutomationProviderIdSchema,
  label: z.string(),
  providerVersion: z.string(),
  selectorRegistryVersion: z.string(),
  lastSuccessfulRun: z.string().nullable(),
  overrideCount: z.number().int().nonnegative(),
});

export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const ConnectionTestKindSchema = z.enum([
  'gemini',
  'notebook',
  'drive',
  'browserProfile',
]);

export type ConnectionTestKind = z.infer<typeof ConnectionTestKindSchema>;

export const ConnectionTestRequestSchema = z.object({
  kind: ConnectionTestKindSchema,
  accountId: z.string().uuid(),
});

export const ConnectionTestResponseSchema = z.object({
  kind: ConnectionTestKindSchema,
  ok: z.boolean(),
  message: z.string(),
  durationMs: z.number().nonnegative(),
  details: z.record(z.unknown()).optional(),
});

export type ConnectionTestResponse = z.infer<typeof ConnectionTestResponseSchema>;

export const HealthReportSchema = z.object({
  generatedAt: z.string(),
  appVersion: z.string(),
  schemaVersion: z.number().int(),
  providers: z.array(ProviderStatusSchema),
  recentFailures: z.array(
    z.object({
      path: z.string(),
      modifiedAt: z.string(),
      kind: z.enum(['screenshot', 'html', 'other']),
    }),
  ),
  selectorOverridesPath: z.string(),
  selectorOverridesValid: z.boolean(),
  logRedactionEnabled: z.literal(true),
  notes: z.array(z.string()),
});

export type HealthReport = z.infer<typeof HealthReportSchema>;

export const ExportDiagnosticsRequestSchema = z.object({
  outputPath: z.string().min(1).optional(),
  accountId: z.string().uuid().optional(),
});

export const ExportDiagnosticsResponseSchema = z.object({
  filePath: z.string(),
  entryCount: z.number().int().nonnegative(),
  excluded: z.array(z.string()),
});

export const InteractiveRepairStartRequestSchema = z.object({
  accountId: z.string().uuid(),
  providerId: AutomationProviderIdSchema,
  startUrl: z.string().url().optional(),
  selectorKey: z.string().min(1).max(64),
});

export const LocatorSuggestionSchema = z.object({
  rejected: z.boolean(),
  rejectReason: z.string().nullable(),
  tagName: z.string().nullable(),
  suggestedStrategies: z.array(SelectorStrategyOverrideSchema),
  metadata: z.object({
    id: z.string().nullable(),
    testId: z.string().nullable(),
    role: z.string().nullable(),
    name: z.string().nullable(),
    label: z.string().nullable(),
    placeholder: z.string().nullable(),
    textSnippet: z.string().nullable(),
    cssPath: z.string().nullable(),
  }),
  pageUrl: z.string().nullable(),
  pageTitle: z.string().nullable(),
});

export type LocatorSuggestion = z.infer<typeof LocatorSuggestionSchema>;

export const InteractiveRepairStartResponseSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
});

export const InteractiveRepairCaptureRequestSchema = z.object({
  sessionId: z.string().min(1),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

export const InteractiveRepairCaptureResponseSchema = z.object({
  sessionId: z.string(),
  selectorKey: z.string(),
  providerId: AutomationProviderIdSchema,
  suggestion: LocatorSuggestionSchema,
});

export const InteractiveRepairApplyRequestSchema = z.object({
  sessionId: z.string().min(1),
  mode: z.enum(['prepend', 'append', 'replace']).default('prepend'),
});

export const InteractiveRepairApplyResponseSchema = z.object({
  ok: z.boolean(),
  filePath: z.string(),
  selectorKey: z.string(),
});

export const InteractiveRepairCancelRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const ListProviderStatusResponseSchema = z.object({
  providers: z.array(ProviderStatusSchema),
});

export const GetHealthReportResponseSchema = HealthReportSchema;
