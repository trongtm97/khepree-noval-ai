# Browser Conversation Reliability

Phase 2 shared harness for Gemini, ChatGPT, and Meta AI browser automation.

## Problem

Each provider previously owned its own send → wait → extract loop. Failures included:

- Treating Send click or Enter as proof the prompt left the composer
- Returning the **last assistant bubble** in the DOM without proof it was new
- Meta fallback: `assistants[expected] ?? assistants[last]` when no new assistant existed
- One giant timeout instead of phase-specific deadlines

## Architecture

```
BrowserConversationHarness          (lifecycle owner)
        │
        ├── BrowserConversationSurfaceAdapter (interface)
        │         ├── ChatGptSurfaceAdapter
        │         ├── MetaAiSurfaceAdapter
        │         └── GeminiSurfaceAdapter
        │
        ├── request-marker.ts       NTS_REQUEST_REF correlation
        └── lifecycle.ts            states + phase timeouts
```

Providers (`ChatGptBrowserProvider`, `MetaAiBrowserProvider`) delegate navigation/new-chat only; harness owns conversation turns.

## Lifecycle states

| State | Meaning |
|-------|---------|
| `PREPARED` | Harness started |
| `COMPOSER_FOUND` | Editable composer located |
| `PROMPT_FILLED` | Prompt + marker verified in composer |
| `SEND_CLICKED` | Send action fired |
| `SEND_CONFIRMED` | Strong send evidence observed |
| `GENERATION_STARTED` | Stop control / new assistant / streaming |
| `RESPONSE_CREATED` | Anchored assistant has content |
| `RESPONSE_STREAMING` | Text still growing or stop visible |
| `RESPONSE_STABILIZING` | Hash stable, waiting quiet interval |
| `RESPONSE_CAPTURED` | Final text read |
| `COMPLETED` | Success |

Failure codes: `SEND_NOT_CONFIRMED`, `RESPONSE_NOT_FOUND`, `RESPONSE_AMBIGUOUS`, `LOGIN_REQUIRED`, `RATE_LIMIT`, `UI_CHANGED`, `TIMEOUT`, `COMPOSER_FILL_FAILED`, `SEND_DISABLED`.

## Send confirmation

Click/Enter is **not** proof. After send, harness polls until one of:

- Composer cleared (marker gone)
- New user turn with `NTS_REQUEST_REF: <uuid>`
- User turn count increased
- Generating/stop control visible
- New assistant turn appeared

Timeout → `SEND_NOT_CONFIRMED`. Harness does **not** proceed to response capture.

## Correlation marker

Every request gets `requestId`. Prompt appended with:

```
<!-- NTS_REQUEST_REF: <uuid> -->
```

Marker locates the **user turn** in DOM. Do not rely on model echoing it.

## Response anchor

Preferred path:

1. Find user message containing marker
2. Find assistant turn paired with / following that user turn (adapter-specific)

Fallback (only with strong proof):

- Assistant count increased **and**
- New assistant text hash not in pre-send snapshot

**Never** return last assistant without proof it is new.

## Absolute invariant

If send is not confirmed and no new assistant turn exists, **old response must never be returned**.

Enforced in:

- `BrowserConversationHarness.enforceNoStaleResponse()`
- Removed ChatGPT last-assistant DOM scrape
- Removed Meta `assistants[expected] ?? assistants[last]` fallback

## Phase timeouts

| Phase | Default |
|-------|---------|
| Composer | 15s |
| Send confirm | 12s |
| Generation start | 45s |
| Streaming | 120s |
| Stabilization | 180s |
| Stabilization quiet | 1.2s poll interval |

Providers pass `maxTimeoutMs` into streaming/stabilization budgets.

## Surface adapters

`BrowserConversationSurfaceAdapter` methods:

- `detectSurface`, `findComposer`, `fillComposer`, `readComposerText`
- `clickSend`, `detectSendConfirmation`
- `countUserTurns`, `countAssistantTurns`
- `findUserTurnIndexByMarker`, `findAssistantIndexForUserTurn`
- `readAssistantText`, `isGenerating`, `hashAssistantText`
- `cancelGeneration`, `detectLoginRequired`, `detectRateLimit`, `detectBlockedOrSecurityChallenge`
- `getDiagnostics` — winning selectors, surface id

### Selector policy

Prefer `data-testid`, `role`, `aria-label`. Broad CSS (e.g. bare `div[contenteditable="true"]`) only when scoped to composer container.

### Meta composer

Uses Playwright `fill`, `pressSequentially`, `keyboard.insertText`. Post-fill verification via `verifyComposerPayload`. Failure → `COMPOSER_FILL_FAILED`.

## Cancel

`isCancelled()` callback → adapter `cancelGeneration()` → `GENERATION_ERROR`. No orphan active request.

## Diagnostics

On failure, `AutomationError` diagnostics include:

- Provider, surface, URL
- Composer selector, turn counts before send
- Send evidence, lifecycle state
- Adapter-specific selector keys

Full novel prompt not stored unless diagnostics setting allows (future).

## Tests

| Location | Coverage |
|----------|----------|
| `tests/unit/automation/browser-conversation-harness.test.ts` | Mock adapter + HTML fixtures |
| `tests/fixtures/conversation/*.html` | Synthetic ChatGPT/Meta DOM |

Critical test: pre-existing assistant + failed send → must throw, never return stale text.

Run:

```bash
rtk npx vitest run tests/unit/automation/browser-conversation-harness.test.ts
```

## Real smoke (developer only)

Not run in CI. Requires logged-in browser profiles.

1. Set `BROWSER_CONVERSATION_SMOKE=1`
2. Run provider smoke script (when wired) with 3 short synthetic paragraphs
3. Verify send confirmation + anchored response for ChatGPT, Meta, Gemini

Do **not** mark Phase 2 done from mock DOM tests alone — run fixture tests + at least one live smoke per provider before production reliance.

## Files

| Path | Role |
|------|------|
| `src/main/automation/conversation/lifecycle.ts` | States, timeouts, types |
| `src/main/automation/conversation/request-marker.ts` | Correlation marker |
| `src/main/automation/conversation/surface-adapter.ts` | Adapter interface |
| `src/main/automation/conversation/browser-conversation-harness.ts` | Shared orchestrator |
| `src/main/automation/conversation/adapters/*` | Provider DOM adapters |
| `src/main/automation/providers/openai/chatgpt-browser-provider.ts` | Harness delegate |
| `src/main/automation/providers/meta/meta-ai-browser-provider.ts` | Harness delegate |

Gemini browser provider retains mature anchor/send path; `GeminiSurfaceAdapter` enables future full harness migration.
