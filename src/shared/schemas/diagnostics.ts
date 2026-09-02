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

/** Stepwise AI browser diagnostics (Settings → Chẩn đoán AI). */
export const AiBrowserProbeKindSchema = z.enum([
  'browser',
  'login',
  'notebook',
  'composer',
  'send',
  'trialTranslate',
]);

export type AiBrowserProbeKind = z.infer<typeof AiBrowserProbeKindSchema>;

export const AiBrowserProbeRequestSchema = z.object({
  kind: AiBrowserProbeKindSchema,
  accountId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
});

export const AiBrowserProbeStepSchema = z.object({
  step: z.string(),
  ok: z.boolean(),
  message: z.string().optional(),
});

export const AiBrowserProbeResponseSchema = z.object({
  kind: AiBrowserProbeKindSchema,
  ok: z.boolean(),
  failedStep: z.string().nullable(),
  lastOkStep: z.string().nullable(),
  message: z.string(),
  durationMs: z.number().nonnegative(),
  steps: z.array(AiBrowserProbeStepSchema),
  diagnosticsDir: z.string().nullable().optional(),
  timeline: z.unknown().nullable().optional(),
  errorCode: z.string().nullable().optional(),
});

export type AiBrowserProbeResponse = z.infer<typeof AiBrowserProbeResponseSchema>;

export const GoogleSmokeRunRequestSchema = z.object({
  accountId: z.string().uuid(),
  notebookUrl: z.string().url(),
  smokeProjectLabel: z.string().min(3).default('KHEPREE_NOVEL_AI_SMOKE'),
  headless: z.boolean().optional(),
  scenarios: z
    .array(z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']))
    .optional(),
});

export const GoogleSmokeRunResponseSchema = z.object({
  overall: z.enum(['PASS', 'FAIL', 'NOT_RUN']),
  startedAt: z.string(),
  finishedAt: z.string(),
  reportPath: z.string(),
  artifactsDir: z.string(),
  results: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(['PASS', 'FAIL', 'SKIP']),
      durationMs: z.number(),
      message: z.string(),
      screenshotPath: z.string().nullable(),
      timelinePath: z.string().nullable(),
    }),
  ),
});

export type GoogleSmokeRunResponse = z.infer<typeof GoogleSmokeRunResponseSchema>;

export const NotebookGroundingSmokeRunRequestSchema = z.object({
  accountId: z.string().uuid(),
  notebookUrl: z.string().url(),
  smokeProjectLabel: z.string().min(3).default('KHEPREE_NOVEL_AI_SMOKE'),
  headless: z.boolean().optional(),
  tests: z.array(z.enum(['A', 'B', 'C', 'D'])).optional(),
  groundingKnowledgeDriveFileId: z.string().min(5).optional(),
  groundingSyncStateDriveFileId: z.string().min(5).optional(),
});

export const NotebookGroundingSmokeRunResponseSchema = z.object({
  overall: z.enum(['PASS', 'FAIL', 'NOT_RUN']),
  startedAt: z.string(),
  finishedAt: z.string(),
  reportPath: z.string(),
  artifactsDir: z.string(),
  knowledgeKey: z.string().nullable(),
  notebookName: z.string().nullable(),
  results: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(['PASS', 'FAIL', 'SKIP']),
      durationMs: z.number(),
      localVersion: z.number().nullable(),
      notebookVersion: z.number().nullable(),
      bindingType: z.enum(['STATIC', 'UNKNOWN']).nullable(),
      driveFileId: z.string().nullable(),
      notebookName: z.string().nullable(),
      packMode: z.enum(['SLIM', 'HYBRID', 'FAT', 'N/A']).nullable(),
      response: z.string().nullable(),
      message: z.string(),
      screenshotPath: z.string().nullable(),
    }),
  ),
});

export type NotebookGroundingSmokeRunResponse = z.infer<
  typeof NotebookGroundingSmokeRunResponseSchema
>;

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
  profileLeases: z
    .array(
      z.object({
        accountId: z.string(),
        ownerId: z.string(),
        operation: z.string(),
        label: z.string(),
        pid: z.number().int(),
        expiresAt: z.string(),
        profilePath: z.string(),
      }),
    )
    .optional(),
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
