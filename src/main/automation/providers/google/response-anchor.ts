import { createHash } from 'node:crypto';
import type { Locator, Page } from 'playwright';
import { normalizeComposerText } from '@shared/utils/notebook-composer-fill';
import { userMessageLocators } from './conversation-snapshot';

export type AnchorResolveVia =
  | 'pair'
  | 'sibling'
  | 'correlation_attr'
  | 'baseline_new'
  | 'baseline_changed';

export interface AssistantBaseline {
  count: number;
  lastHash: string | null;
  /** Fingerprints of assistant bubbles present before Send. */
  fingerprints: string[];
}

/**
 * Ties the current request to a specific user turn and (once resolved) assistant bubble.
 * Never implies "last bubble in the list".
 */
export interface ResponseAnchor {
  correlationId: string;
  marker: string;
  userMessageFingerprint: string | null;
  assistantBaseline: AssistantBaseline;
  targetResponseFingerprint: string | null;
  resolvedVia: AnchorResolveVia | null;
}

export type GenerationStartEvidence =
  | 'user_message_confirmed'
  | 'new_assistant_container'
  | 'assistant_text_started'
  | 'stop_generating_visible'
  | 'aria_busy'
  | 'baseline_text_changed'
  | 'new_conversation_turn';

function fingerprintText(text: string): string {
  return createHash('sha256')
    .update(normalizeComposerText(text), 'utf8')
    .digest('hex')
    .slice(0, 16);
}

export function createResponseAnchor(input: {
  correlationId: string;
  marker: string;
  assistantCount: number;
  lastAssistantHash: string | null;
  assistantFingerprints: string[];
}): ResponseAnchor {
  return {
    correlationId: input.correlationId,
    marker: input.marker,
    userMessageFingerprint: null,
    assistantBaseline: {
      count: input.assistantCount,
      lastHash: input.lastAssistantHash,
      fingerprints: [...input.assistantFingerprints],
    },
    targetResponseFingerprint: null,
    resolvedVia: null,
  };
}

export async function collectAssistantFingerprints(
  assistants: Locator,
): Promise<string[]> {
  const count = await assistants.count().catch(() => 0);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = (await assistants.nth(i).innerText().catch(() => '')).trim();
    out.push(text ? fingerprintText(text) : `empty:${i}`);
  }
  return out;
}

export async function findUserMessageWithMarker(
  page: Page,
  marker: string,
): Promise<{ locator: Locator; fingerprint: string; index: number } | null> {
  const users = userMessageLocators(page);
  const count = await users.count().catch(() => 0);
  // Prefer the latest matching user message (re-sends / DOM rebuild).
  for (let i = count - 1; i >= 0; i--) {
    const loc = users.nth(i);
    const text = (await loc.innerText().catch(() => '')).trim();
    if (text.includes(marker)) {
      return { locator: loc, fingerprint: fingerprintText(text), index: i };
    }
  }
  return null;
}

/**
 * Prefer structural relationship from the user turn; else baseline delta only.
 * Returns null when no candidate is provably tied to this request.
 * Throws-like result via `ambiguous: true` when multiple candidates collide.
 */
export async function resolveAssistantForAnchor(input: {
  page: Page;
  assistants: Locator;
  anchor: ResponseAnchor;
  userLocator: Locator | null;
}): Promise<
  | { ok: true; locator: Locator; fingerprint: string; via: AnchorResolveVia }
  | { ok: false; ambiguous: boolean; reason: string }
> {
  const { page, assistants, anchor, userLocator } = input;

  // 1) Structural: message pair / sibling after the user bubble.
  if (userLocator) {
    const structural = await findStructuralAssistant(userLocator);
    if (structural) {
      const text = (await structural.locator.innerText().catch(() => '')).trim();
      const fingerprint = text ? fingerprintText(text) : 'empty-structural';
      return {
        ok: true,
        locator: structural.locator,
        fingerprint,
        via: structural.via,
      };
    }
  }

  // 2) data-correlation-id stamped on assistant (fixtures / some UIs).
  const byAttr = page.locator(
    `[data-correlation-id="${cssEscape(anchor.correlationId)}"]`,
  );
  const attrCount = await byAttr.count().catch(() => 0);
  if (attrCount === 1) {
    const loc = byAttr.first();
    const text = (await loc.innerText().catch(() => '')).trim();
    const fingerprint = text ? fingerprintText(text) : 'empty-attr';
    const baselineHas = anchor.assistantBaseline.fingerprints.includes(fingerprint);
    // Accept only if new vs baseline or empty streaming shell (new container).
    if (!baselineHas || text.length === 0) {
      return {
        ok: true,
        locator: loc,
        fingerprint,
        via: 'correlation_attr',
      };
    }
    // Attribute on an OLD bubble with unchanged text → reject.
  } else if (attrCount > 1) {
    return {
      ok: false,
      ambiguous: true,
      reason: `Multiple nodes with data-correlation-id=${anchor.correlationId}`,
    };
  }

  // 3) Baseline delta: new assistant bubbles after Send, or changed text on a post-baseline slot.
  const count = await assistants.count().catch(() => 0);
  const candidates: { locator: Locator; fingerprint: string; via: AnchorResolveVia }[] =
    [];

  for (let i = 0; i < count; i++) {
    const loc = assistants.nth(i);
    const text = (await loc.innerText().catch(() => '')).trim();
    const fingerprint = text ? fingerprintText(text) : `empty:${i}`;
    if (i >= anchor.assistantBaseline.count) {
      candidates.push({ locator: loc, fingerprint, via: 'baseline_new' });
      continue;
    }
    const beforeFp = anchor.assistantBaseline.fingerprints[i];
    if (beforeFp && beforeFp !== fingerprint) {
      candidates.push({ locator: loc, fingerprint, via: 'baseline_changed' });
    }
  }

  if (candidates.length === 1) {
    return { ok: true, ...candidates[0] };
  }
  if (candidates.length > 1) {
    // Prefer non-empty streaming/new text among new indices.
    const nonEmpty = candidates.filter((c) => !c.fingerprint.startsWith('empty'));
    if (nonEmpty.length === 1) {
      return { ok: true, ...nonEmpty[0] };
    }
    return {
      ok: false,
      ambiguous: true,
      reason: `Ambiguous assistant candidates after Send (${candidates.length})`,
    };
  }

  return {
    ok: false,
    ambiguous: false,
    reason: 'No assistant response provably tied to this request',
  };
}

async function findStructuralAssistant(
  userLocator: Locator,
): Promise<{ locator: Locator; via: 'pair' | 'sibling' } | null> {
  // Same message-pair / turn container.
  const pairAssistant = userLocator.locator(
    'xpath=ancestor::*[@data-testid="message-pair" or contains(@class,"chat-message-pair")][1]//*[@data-testid="assistant-response" or @data-assistant-response or @data-message-author-role="model"][1]',
  );
  if ((await pairAssistant.count().catch(() => 0)) > 0) {
    return { locator: pairAssistant.first(), via: 'pair' };
  }

  // Next sibling assistant (flat message list).
  const sibling = userLocator.locator(
    'xpath=following-sibling::*[@data-testid="assistant-response" or @data-assistant-response or @data-message-author-role="model"][1]',
  );
  if ((await sibling.count().catch(() => 0)) > 0) {
    return { locator: sibling.first(), via: 'sibling' };
  }

  return null;
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function detectGenerationStart(input: {
  page: Page;
  assistants: Locator;
  anchor: ResponseAnchor;
  isStreamingVisible: () => Promise<boolean>;
  isStopVisible: () => Promise<boolean>;
  /** Optional: target already resolved — prefer observing it. */
  targetLocator?: Locator | null;
  readTargetText?: () => Promise<string>;
}): Promise<GenerationStartEvidence | null> {
  const user = await findUserMessageWithMarker(input.page, input.anchor.marker);

  if (input.targetLocator) {
    const count = await input.targetLocator.count().catch(() => 0);
    if (count > 0) {
      const text = input.readTargetText
        ? (await input.readTargetText()).trim()
        : (await input.targetLocator.innerText().catch(() => '')).trim();
      if (text.length > 0) {
        return 'assistant_text_started';
      }
      return 'new_assistant_container';
    }
  }

  if (user && !input.anchor.userMessageFingerprint) {
    return 'user_message_confirmed';
  }

  const assistantCount = await input.assistants.count().catch(() => 0);
  if (assistantCount > input.anchor.assistantBaseline.count) {
    const newest = input.assistants.nth(assistantCount - 1);
    const text = (await newest.innerText().catch(() => '')).trim();
    if (text.length > 0) return 'assistant_text_started';
    return 'new_assistant_container';
  }

  for (let i = 0; i < assistantCount; i++) {
    const text = (await input.assistants.nth(i).innerText().catch(() => '')).trim();
    const fp = text ? fingerprintText(text) : `empty:${i}`;
    const beforeFp = input.anchor.assistantBaseline.fingerprints[i];
    if (beforeFp && beforeFp !== fp) {
      return 'baseline_text_changed';
    }
  }

  if (await input.isStopVisible()) {
    return 'stop_generating_visible';
  }

  const ariaBusy = await input.page
    .locator('[aria-busy="true"], [aria-live="assertive"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (ariaBusy && (user || input.anchor.userMessageFingerprint)) {
    return 'aria_busy';
  }

  if (await input.isStreamingVisible()) {
    if (user || input.anchor.userMessageFingerprint) {
      return 'new_conversation_turn';
    }
  }

  if (user) {
    return 'user_message_confirmed';
  }

  return null;
}

export { fingerprintText };
