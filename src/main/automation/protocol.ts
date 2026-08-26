import { z } from 'zod';
import {
  AUTOMATION_COMMANDS,
  AUTOMATION_ERROR_CODES,
  BROWSER_STATES,
} from './types';

export const AutomationCommandSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    type: z.literal('OPEN'),
    profilePath: z.string().min(1),
    headless: z.boolean().optional(),
    startUrl: z.string().url().optional(),
    diagnosticsDir: z.string().min(1).optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('NAVIGATE'),
    url: z.string().url(),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('GET_STATUS'),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('SCREENSHOT'),
    tag: z.string().min(1).optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('CLOSE'),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('RESTART'),
    startUrl: z.string().url().optional(),
  }),
]);

export type AutomationCommand = z.infer<typeof AutomationCommandSchema>;

export const AutomationFailureDiagnosticsSchema = z.object({
  screenshotPath: z.string().nullable(),
  htmlSnapshotPath: z.string().nullable(),
  domFragmentPath: z.string().nullable().optional(),
  currentUrl: z.string().nullable(),
  pageTitle: z.string().nullable().optional(),
  operationName: z.string(),
  selectorKey: z.string().nullable().optional(),
  selectorCandidates: z.array(z.string()).optional(),
  timestamp: z.string(),
});

export type AutomationFailureDiagnostics = z.infer<
  typeof AutomationFailureDiagnosticsSchema
>;

export const AutomationResultSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  state: z.enum(BROWSER_STATES),
  data: z.record(z.unknown()).optional(),
  errorCode: z.enum(AUTOMATION_ERROR_CODES).optional(),
  errorMessage: z.string().optional(),
  diagnostics: AutomationFailureDiagnosticsSchema.optional(),
});

export type AutomationResult = z.infer<typeof AutomationResultSchema>;

export const RunnerOutboundMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('result'),
    result: AutomationResultSchema,
  }),
  z.object({
    kind: z.literal('event'),
    event: z.string(),
    payload: z.record(z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal('log'),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string(),
  }),
]);

export type RunnerOutboundMessage = z.infer<typeof RunnerOutboundMessageSchema>;

export function parseAutomationCommand(raw: unknown): AutomationCommand {
  return AutomationCommandSchema.parse(raw);
}

export function parseAutomationResult(raw: unknown): AutomationResult {
  return AutomationResultSchema.parse(raw);
}

export function assertCommandType(
  type: string,
): asserts type is (typeof AUTOMATION_COMMANDS)[number] {
  if (!(AUTOMATION_COMMANDS as readonly string[]).includes(type)) {
    throw new Error(`Unknown automation command: ${type}`);
  }
}
