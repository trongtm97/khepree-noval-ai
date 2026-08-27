import { createHash } from 'node:crypto';
import type { Locator, Page } from 'playwright';
import { hashComposerText, normalizeComposerText } from '@shared/utils/notebook-composer-fill';

export interface ConversationSnapshot {
  userMessageCount: number;
  assistantMessageCount: number;
  lastUserHash: string | null;
  lastAssistantHash: string | null;
  composerHash: string;
  composerLength: number;
  currentUrl: string;
  correlationMarker: string;
}

export type SendConfirmEvidence =
  | 'composer_cleared'
  | 'user_message_with_marker'
  | 'turn_count_increased'
  | 'stop_generating_visible'
  | 'new_assistant_response';

function shortHash(text: string): string {
  return createHash('sha256').update(normalizeComposerText(text), 'utf8').digest('hex').slice(0, 16);
}

export function userMessageLocators(page: Page): Locator {
  return page
    .getByTestId('user-message')
    .or(page.locator('[data-user-message]'))
    .or(page.locator('.chat-message-pair .from-user-container .message-text-content'))
    .or(page.locator('.from-user-container .message-text-content'))
    .or(page.locator('.from-user-message-inner-content'))
    .or(page.locator('[data-message-author-role="user"]'));
}

export function stopGeneratingLocators(page: Page): Locator {
  return page
    .getByTestId('stop-generation')
    .or(page.locator('[data-action="stop-generation"]'))
    .or(page.getByRole('button', { name: /stop|cancel generation|dừng|hủy/i }))
    .or(page.locator('button[aria-label*="Stop" i]'));
}

export async function captureConversationSnapshot(input: {
  page: Page;
  composer: Locator;
  assistantResponses: Locator;
  correlationMarker: string;
  composerText: string;
}): Promise<ConversationSnapshot> {
  const users = userMessageLocators(input.page);
  const userCount = await users.count().catch(() => 0);
  const assistantCount = await input.assistantResponses.count().catch(() => 0);

  let lastUserHash: string | null = null;
  if (userCount > 0) {
    const text = (await users.nth(userCount - 1).innerText().catch(() => '')).trim();
    lastUserHash = text ? shortHash(text) : null;
  }

  let lastAssistantHash: string | null = null;
  if (assistantCount > 0) {
    const text = (
      await input.assistantResponses.nth(assistantCount - 1).innerText().catch(() => '')
    ).trim();
    lastAssistantHash = text ? shortHash(text) : null;
  }

  return {
    userMessageCount: userCount,
    assistantMessageCount: assistantCount,
    lastUserHash,
    lastAssistantHash,
    composerHash: hashComposerText(input.composerText),
    composerLength: normalizeComposerText(input.composerText).length,
    currentUrl: input.page.url(),
    correlationMarker: input.correlationMarker,
  };
}

export async function detectSendConfirmation(input: {
  page: Page;
  composer: Locator;
  assistantResponses: Locator;
  before: ConversationSnapshot;
  correlationMarker: string;
  readComposerText: () => Promise<string>;
}): Promise<SendConfirmEvidence | null> {
  const composerText = await input.readComposerText();
  const composerNormalized = normalizeComposerText(composerText).trim();
  if (!composerNormalized) {
    return 'composer_cleared';
  }
  // Cleared enough that only a stub remains (UI sometimes leaves a blank newline).
  if (
    input.before.composerLength > 32 &&
    composerNormalized.length < Math.max(8, Math.floor(input.before.composerLength * 0.15))
  ) {
    return 'composer_cleared';
  }

  const users = userMessageLocators(input.page);
  const userCount = await users.count().catch(() => 0);
  if (userCount > input.before.userMessageCount) {
    for (let i = input.before.userMessageCount; i < userCount; i++) {
      const text = (await users.nth(i).innerText().catch(() => '')).trim();
      if (text.includes(input.correlationMarker)) {
        return 'user_message_with_marker';
      }
    }
    return 'turn_count_increased';
  }

  // Existing last user bubble gained the marker (fixture may append into list).
  if (userCount > 0) {
    const text = (await users.nth(userCount - 1).innerText().catch(() => '')).trim();
    if (text.includes(input.correlationMarker)) {
      const hash = shortHash(text);
      if (hash !== input.before.lastUserHash) {
        return 'user_message_with_marker';
      }
    }
  }

  const assistantCount = await input.assistantResponses.count().catch(() => 0);
  if (assistantCount > input.before.assistantMessageCount) {
    return 'new_assistant_response';
  }

  const stop = stopGeneratingLocators(input.page).first();
  const stopVisible = await stop.isVisible().catch(() => false);
  if (stopVisible) {
    return 'stop_generating_visible';
  }

  return null;
}

/** True when snapshot suggests the prompt is still sitting in the composer (safe to retry send). */
export function looksUnsent(
  before: ConversationSnapshot,
  composerText: string,
  evidence: SendConfirmEvidence | null,
): boolean {
  if (evidence) return false;
  const current = normalizeComposerText(composerText).trim();
  if (!current) return false;
  return hashComposerText(composerText) === before.composerHash;
}
