# Playwright Audit — Before Hardening Fix

> Baseline captured 2026-08-26. **No Gemini/Notebook selectors changed in the Browser Engine upgrade that followed.**

## Pipeline (actual call chain)

Translation send path (production):

`JobScheduler` → `BatchExecutor.execute` → `AiProviderManager.sendForJob` → `PlaywrightGeminiAdapter.sendPrompt` → `GeminiService.sendTranslation` → `GeminiBrowserProvider.*`

| Step | File | Method | Evidence | Timeout | Retry | Failure mode |
|------|------|--------|----------|---------|-------|--------------|
| ACCOUNT LOGIN | `browser-session-controller.ts` / `account-worker-service.ts` | `PlaywrightBrowserSessionController.open` + `probeSession` | URL `accounts.google.com`, body email / captcha heuristics | goto 60s | Manual user login; reopen session | `LOGIN_REQUIRED` / `NEEDS_ATTENTION` |
| PROFILE | `profile-manager.ts` + `profile-lock.ts` | `resolveProfilePath` + `acquire` | `%APPDATA%/KhepreeNovelAI/browser-profiles/<id>/` + `.khepree-novel-ai.lock` | n/a | `forceClearStaleLock` on crash paths | Throw if second owner |
| OPEN NOTEBOOK | `gemini-browser-provider.ts` | `openProjectNotebook` | `page.goto(notebookUrl)`, `appShell` / `notebookContext` selectors | goto 30s; context visible 5s | none | `LOGIN_REQUIRED` / `SELECTOR_NOT_FOUND` |
| FIND COMPOSER | `gemini-browser-provider.ts` | `createOrOpenTranslationThread` | `promptInput` editable; optional `activeThread` / `newChatButton` | 2.5–8s | reuse → new chat → wait | `SELECTOR_NOT_FOUND` |
| FILL PROMPT | `gemini-browser-provider.ts` | `fillChatComposer` | Angular setter + char count validate | click 5s; fill 15s; settle 800ms | insertText → fill → setter again | `UNKNOWN_UI` char mismatch |
| SEND | `gemini-browser-provider.ts` | `clickSendOrPressEnter` | enabled send CSS → `sendButton` → Enter → Ctrl/Meta+Enter | wait enabled 20s; click 5s | Enter / Ctrl+Enter / re-click | `UNKNOWN_UI` send disabled |
| CONFIRM SENT | — | **missing** | no composer-cleared / user-bubble check | — | — | False send silent until generation timeout |
| DETECT GENERATION | `gemini-browser-provider.ts` + `response-stabilizer.ts` | `waitForGenerationStart` | streaming / loading / correlation bubble | default 15s; poll 100ms | none | `RESPONSE_TIMEOUT` |
| LOCATE RESPONSE | `google-gemini.selectors.ts` | `responseForCorrelation` → `assistantResponses().last()` | `data-correlation-id` then last assistant bubble | n/a | correlation → last bubble fallback | Wrong bubble risk |
| WAIT COMPLETE | `response-stabilizer.ts` | `waitForStableResponse` | text stable + not streaming | max 120s (preprocess 600s); stable 1.5s; poll 200ms | none | `RESPONSE_TIMEOUT` |
| EXTRACT | `gemini-browser-provider.ts` | `extractLatestResponse` / `readBubbleText` | `.message-text-content` then `innerText` | n/a | sanitize | `SELECTOR_NOT_FOUND` empty |
| PARSE | `jobs/response-parser.ts` | `ResponseParser.parse` | OUTPUT_PROTOCOL sections | n/a | strict → tolerant → loose lines | `needs_repair` |
| QA | `jobs/qa-checker.ts` | `runLocalQa` | missing/dup/empty/locked terms | n/a | normalize ID noise | FAIL / MANUAL_REVIEW |
| NEXT BATCH | `batch-executor.ts` + `repair-loop.ts` + `ai-provider-manager.ts` | repair loop / chunk queue | job state machine | lease heartbeat | max repair 2; quota cooldown | `NEEDS_ATTENTION` / requeue |

## Hotspots (pre-engine upgrade)

### `launchPersistentContext()` (all direct; later centralized)

- `gemini-service.ts`, `notebook-service.ts` (×2), `full-novel-preprocess-auto-service.ts`
- `diagnostics-service.ts` (×2), `browser-session.ts`, `browser-session-controller.ts`

### `forceClearStaleLock()`

- `profile-lock.ts` (definition)
- `batch-executor.ts`, `notebook-service.ts`, `account-worker-service.ts`, `automation-manager.ts`, `full-novel-preprocess-auto-service.ts`

### `waitForTimeout()`

- Heavy in `notebook-provider.ts` and `gemini-browser-provider.ts` (fixed sleeps 200–1500ms)

### Enter / Ctrl+Enter fallback

- `clickSendOrPressEnter`: Enter → Control+Enter / Meta+Enter → optional second click

### Last assistant response

- `readResponseText`: correlation scoped locator, else `assistantResponses().nth(count-1)`

### Headless defaults (pre-fix)

- Gemini/Notebook services: `headless ?? false` (headed) ✅
- `BrowserSession`: **`headless ?? true`** ❌ (fixed in Browser Engine work → default false)
- Diagnostics connection probe: headless true (intentional)

### Custom Chromium args (pre-fix)

- Default `--disable-blink-features=AutomationControlled` on every launch ❌
- Post-fix: **removed from default**; opt-in via `NTS_DISABLE_AUTOMATION_CONTROLLED` / advanced config

## Browser Engine upgrade (same day, after this baseline)

- Playwright **1.62.1** (was `^1.49.1`) — see `docs/PLAYWRIGHT_1_62_BREAKING_CHANGES.md`
- `BrowserEngineResolver` + `launchKhepreeNovelAIPersistentContext`
- Windows AUTO: Edge → Chrome → Playwright Chromium
- Dedicated Khepree Novel AI `userDataDir` only
- Engine/version written to `engine-info.json` + failure diagnostics fields

## Gate results at baseline (2026-08-26, before engine code)

| Command | Result |
|---------|--------|
| `npm run typecheck` | **FAIL** — 2 TS errors (`ensure-translate-ready.ts`, `gemini-selectors-live.test.ts`) |
| `npm run lint` | **FAIL** — 243 errors, 1 warning |
| `npm test` | **FAIL** — 12 failed / 372 passed (66 files) |
| `npm run test:integration` | **PASS** — 2/2 |

Tag/commit target: `pre-playwright-hardening` (docs baseline).
