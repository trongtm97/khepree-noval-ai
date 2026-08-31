import type { Page } from 'playwright';
import type { SendConfirmEvidence, TurnCounts } from './lifecycle';

/** Provider-specific DOM surface — harness owns lifecycle timing. */
export interface BrowserConversationSurfaceAdapter {
  readonly providerId: string;
  readonly surfaceName: string;

  attach(page: Page): void;

  detectSurface(): Promise<{ ok: true } | { ok: false; reason: string }>;

  findComposer(): Promise<{ ok: true; selector: string } | { ok: false; reason: string }>;

  fillComposer(text: string): Promise<{ ok: true } | { ok: false; reason: string }>;

  readComposerText(): Promise<string>;

  readComposerHash(): Promise<string>;

  clickSend(): Promise<{ ok: true; method: 'button' | 'enter' } | { ok: false; reason: string }>;

  /** Strong evidence that send left the composer / started a turn. */
  detectSendConfirmation(before: TurnCounts, marker: string): Promise<SendConfirmEvidence | null>;

  countUserTurns(): Promise<number>;

  countAssistantTurns(): Promise<number>;

  /** Find user turn index containing marker (-1 if missing). */
  findUserTurnIndexByMarker(marker: string): Promise<number>;

  /** Assistant turn index for anchored user turn; -1 if not yet present. */
  findAssistantIndexForUserTurn(userTurnIndex: number): Promise<number>;

  readAssistantText(assistantIndex: number): Promise<string>;

  isGenerating(): Promise<boolean>;

  /** Hash of assistant at index for stability checks. */
  hashAssistantText(assistantIndex: number): Promise<string | null>;

  cancelGeneration(): Promise<void>;

  detectLoginRequired(): Promise<boolean>;

  detectRateLimit(): Promise<boolean>;

  detectBlockedOrSecurityChallenge(): Promise<boolean>;

  /** Last winning selector keys for diagnostics. */
  getDiagnostics(): Record<string, unknown>;
}
