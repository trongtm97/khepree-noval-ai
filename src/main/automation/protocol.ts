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
  errorCode: z.string().nullable().optional(),
  selectorKey: z.string().nullable().optional(),
  selectorCandidates: z.array(z.string()).optional(),
  timestamp: z.string(),
  /** Resolved engine id (EDGE / CHROME / PLAYWRIGHT_CHROMIUM). */
  browserEngine: z.string().nullable().optional(),
  browserEnginePreference: z.string().nullable().optional(),
  playwrightVersion: z.string().nullable().optional(),
  browserChannel: z.string().nullable().optional(),
  browserEngineVersion: z.string().nullable().optional(),
  /** Detected Gemini/Notebook surface id. */
  surface: z.string().nullable().optional(),
  expectedNotebookUrl: z.string().nullable().optional(),
  actualNotebookUrl: z.string().nullable().optional(),
  selectorStrategyWinner: z.string().nullable().optional(),
  composerTextLength: z.number().int().nullable().optional(),
  composerTextHash: z.string().nullable().optional(),
  conversationCountBefore: z.number().int().nullable().optional(),
  conversationCountAfter: z.number().int().nullable().optional(),
  sendEvidence: z.unknown().nullable().optional(),
  responseEvidence: z.unknown().nullable().optional(),
  consoleErrors: z.array(z.string()).optional(),
  pageErrors: z.array(z.string()).optional(),
  /** Ordered AutomationTimeline snapshot (steps + failedStep). */
  timeline: z.unknown().nullable().optional(),
  failedStep: z.string().nullable().optional(),
  lastOkStep: z.string().nullable().optional(),
  timelinePath: z.string().nullable().optional(),
  tracePath: z.string().nullable().optional(),
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

/**
 * Typed utilityProcess IPC (host ↔ runner).
 * Replaces stdio JSON lines + ELECTRON_RUN_AS_NODE.
 */
export const RunnerRequestMessageSchema = z.object({
  type: z.literal('request'),
  requestId: z.string().min(1),
  command: AutomationCommandSchema,
});

export type RunnerRequestMessage = z.infer<typeof RunnerRequestMessageSchema>;

export const RunnerResponseMessageSchema = z.object({
  type: z.literal('response'),
  requestId: z.string().min(1),
  result: AutomationResultSchema.optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
});

export type RunnerResponseMessage = z.infer<typeof RunnerResponseMessageSchema>;

export const RunnerEventMessageSchema = z.object({
  type: z.literal('event'),
  event: z.enum(['runner_ready', 'runner_crash']),
  payload: z.record(z.unknown()).optional(),
});

export type RunnerEventMessage = z.infer<typeof RunnerEventMessageSchema>;

export const RunnerLogMessageSchema = z.object({
  type: z.literal('log'),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
});

export type RunnerLogMessage = z.infer<typeof RunnerLogMessageSchema>;

export const RunnerChildToHostMessageSchema = z.discriminatedUnion('type', [
  RunnerResponseMessageSchema,
  RunnerEventMessageSchema,
  RunnerLogMessageSchema,
]);

export type RunnerChildToHostMessage = z.infer<typeof RunnerChildToHostMessageSchema>;

export type RunnerHostToChildMessage = RunnerRequestMessage;

export function parseAutomationCommand(raw: unknown): AutomationCommand {
  return AutomationCommandSchema.parse(raw);
}

export function parseAutomationResult(raw: unknown): AutomationResult {
  return AutomationResultSchema.parse(raw);
}

export function parseRunnerRequestMessage(raw: unknown): RunnerRequestMessage {
  return RunnerRequestMessageSchema.parse(raw);
}

export function parseRunnerChildToHostMessage(raw: unknown): RunnerChildToHostMessage {
  return RunnerChildToHostMessageSchema.parse(raw);
}

export function assertCommandType(
  type: string,
): asserts type is (typeof AUTOMATION_COMMANDS)[number] {
  if (!(AUTOMATION_COMMANDS as readonly string[]).includes(type)) {
    throw new Error(`Unknown automation command: ${type}`);
  }
}
