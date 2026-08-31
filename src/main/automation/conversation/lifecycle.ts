/**
 * Shared browser conversation lifecycle states (all providers).
 * Harness drives transitions; surface adapters supply DOM operations.
 */

export const BROWSER_CONVERSATION_STATES = [
  'PREPARED',
  'COMPOSER_FOUND',
  'PROMPT_FILLED',
  'SEND_CLICKED',
  'SEND_CONFIRMED',
  'GENERATION_STARTED',
  'RESPONSE_CREATED',
  'RESPONSE_STREAMING',
  'RESPONSE_STABILIZING',
  'RESPONSE_CAPTURED',
  'COMPLETED',
] as const;

export type BrowserConversationState = (typeof BROWSER_CONVERSATION_STATES)[number];

export const BROWSER_CONVERSATION_FAILURES = [
  'SEND_NOT_CONFIRMED',
  'RESPONSE_NOT_FOUND',
  'RESPONSE_AMBIGUOUS',
  'LOGIN_REQUIRED',
  'RATE_LIMIT',
  'UI_CHANGED',
  'TIMEOUT',
  'COMPOSER_FILL_FAILED',
  'SEND_DISABLED',
  'GENERATION_ERROR',
] as const;

export type BrowserConversationFailure = (typeof BROWSER_CONVERSATION_FAILURES)[number];

export type SendConfirmEvidence =
  | 'composer_cleared'
  | 'user_turn_with_marker'
  | 'user_turn_count_increased'
  | 'generating_control_visible'
  | 'new_assistant_turn';

export interface TurnCounts {
  userTurns: number;
  assistantTurns: number;
}

export interface ConversationTurnSnapshot extends TurnCounts {
  composerHash: string;
  lastAssistantTextHash: string | null;
  correlationMarker: string;
}

export interface HarnessPhaseTimeouts {
  composerMs: number;
  sendConfirmMs: number;
  generationStartMs: number;
  streamingMs: number;
  stabilizationMs: number;
  stabilizationPollMs: number;
  stabilizationQuietMs: number;
}

export const DEFAULT_HARNESS_TIMEOUTS: HarnessPhaseTimeouts = {
  composerMs: 15_000,
  sendConfirmMs: 12_000,
  generationStartMs: 45_000,
  streamingMs: 120_000,
  stabilizationMs: 180_000,
  stabilizationPollMs: 400,
  stabilizationQuietMs: 1_200,
};

export interface HarnessRunResult {
  text: string;
  requestId: string;
  correlationId: string;
  finalState: BrowserConversationState;
  sendEvidence: SendConfirmEvidence | null;
  diagnostics: Record<string, unknown>;
}
