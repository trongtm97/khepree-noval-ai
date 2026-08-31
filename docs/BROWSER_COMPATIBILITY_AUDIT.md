# Browser Compatibility Audit — Phase 8

**Date:** 2026-08-29  
**Scope:** Gemini, ChatGPT, Meta AI browser providers  
**Goal:** NovelTrans must not depend on stealth techniques to function.

---

## Executive summary

| Area | Before Phase 8 | After Phase 8 |
|------|----------------|---------------|
| Init-script stealth (`navigator.webdriver`, fake `chrome`, etc.) | Applied on ChatGPT/Meta login + verify | **Removed** — deleted `playwright-stealth.ts` |
| Google login launch flags | Also incorrectly applied to ChatGPT/Meta login | **Scoped to Gemini/Google only** |
| Translation send path | Already standard Playwright | Unchanged |
| Default launch | Standard persistent context | Standard persistent context |
| CAPTCHA / 2FA | User manual only | Unchanged — no bypass |

**Architecture:** dedicated browser profile → user-driven headed login → persistent session → robust UI detection.

---

## 1. Inventory — every stealth / anti-detect modification

### 1.1 REMOVED — Init-script stealth (was `applyPlaywrightStealth`)

**File (deleted):** `src/main/automation/providers/playwright-stealth.ts`

| Modification | What it changed | Why it existed | Required? |
|--------------|-----------------|----------------|-----------|
| `navigator.webdriver = false` | Hides automation flag in page JS | Sites block `webdriver === true` | **No** — not reliable architecture |
| Fake `window.chrome` object | Mimics Chrome extension runtime | Bot-detection heuristics | **No** |
| `permissions.query` patch for notifications | Returns native notification permission | Fingerprint consistency scripts | **No** |
| `navigator.languages` override | Forces `vi-VN, vi, en-US, en` | Locale fingerprint matching | **No** |

**Former call sites (removed):**

- `PlaywrightBrowserAiService.openLoginBrowser` — ChatGPT, Meta AI headed login
- `PlaywrightBrowserAiService.verifyLogin` — ChatGPT, Meta AI headless verify when login browser closed

**Verdict:** Not required. Removed. NovelTrans login/session must work via standard Playwright + dedicated profile + UI selectors.

---

### 1.2 KEPT (opt-in) — `BrowserCompatibilityPatch.GOOGLE_LOGIN_LAUNCH`

**Module:** `src/main/automation/browser-runner/browser-compatibility-patch.ts`  
**Applied via:** `launchNovelTransPersistentContext({ loginCompat: true })`

| Launch option | What it changes | Why it exists | Required? |
|---------------|-----------------|----------------|-----------|
| `ignoreDefaultArgs: ['--enable-automation']` | Strips Playwright's default automation flag | Google sign-in may reject "automation" browser | **Yes for Google login only** |
| `--disable-blink-features=AutomationControlled` | Removes `navigator.webdriver` blink flag at engine level | Google "This browser or app may not be secure" interstitial | **Yes when `loginCompat` is true** |

**Call sites (correct scope):**

| Provider | Path | `loginCompat` |
|----------|------|---------------|
| **Gemini** | `PlaywrightBrowserSessionController.open` → Google account login | `true` |
| ChatGPT | `PlaywrightBrowserAiService.openLoginBrowser` | **`false` (removed in Phase 8)** |
| Meta AI | `PlaywrightBrowserAiService.openLoginBrowser` | **`false` (removed in Phase 8)** |
| Translation send (all) | `browser-runtime-manager` → `launchNovelTransPersistentContext` | `false` |

**Detection when patch insufficient:** `looksLikeInsecureBrowserInterstitial()` → reason `BROWSER_NOT_SECURE` (`browser-session-controller.ts`).

---

### 1.3 KEPT (advanced opt-in) — `BrowserCompatibilityPatch.DISABLE_AUTOMATION_CONTROLLED`

**Env:** `NTS_DISABLE_AUTOMATION_CONTROLLED=1`  
**Default:** OFF (`browser-engine-config.ts`)

| Modification | What it changes | Why | Required? |
|--------------|-----------------|-----|-------------|
| `--disable-blink-features=AutomationControlled` | Engine-level automation flag | Operator troubleshooting | **No** — advanced only |

Never combined with init-script stealth. Never default.

---

### 1.4 NOT stealth — UI detection & session heuristics

These are **required** normal automation — not anti-detect:

| Provider | Detection | File |
|----------|-----------|------|
| Gemini | Login page URL/body, CAPTCHA text, insecure-browser interstitial, cookie extract | `browser-session-controller.ts`, `gemini-browser-provider.ts` |
| ChatGPT | `#prompt-textarea`, `[data-testid="prompt-textarea"]`, contenteditable textbox | `playwright-browser-ai-service.ts`, `chatgpt-surface-adapter.ts` |
| Meta AI | `[data-testid="user-menu-button"]`, `[data-testid="composer-input"]`, login button absence | `playwright-browser-ai-service.ts`, `meta-ai-surface-adapter.ts` |

Surface adapters classify CAPTCHA/security pages → `NEEDS_ATTENTION` / non-retryable — **never bypass**.

---

## 2. Default behavior

```
launchNovelTransPersistentContext({
  profilePath,          // dedicated NovelTrans dir only
  headless: false,       // login default: headed
  loginCompat: false,    // no patches unless Google login
})
```

**Single entry:** `launchNovelTransPersistentContext` in `launch-persistent-context.ts`  
**Never uses:** OS default Chrome/Edge profile (`userDataDir` = `browserProfiles/<worker-id>` only)

Named patches live in `browser-compatibility-patch.ts` — not "stealth".

---

## 3. Security — verification challenges

**Policy:** User performs CAPTCHA, 2FA, and security challenges manually in the headed browser window.

| Action | Status |
|--------|--------|
| CAPTCHA solving automation | **None** |
| 2FA bypass | **None** |
| Security challenge bypass | **None** |
| Password collection/storage | **None** |

**Evidence in code:**

- `browser-session-controller.ts` — comment: "Does not bypass 2FA/CAPTCHA"
- `account-worker-service.ts` — probe returns `NEEDS_ATTENTION` for CAPTCHA; user message instructs manual fix
- `gemini-browser-provider.ts` — `detectUserActionRequired()` → `CAPTCHA`; jobs pause
- Surface adapters — detect captcha/security text; return blocked state, no click-through
- `NON_RETRYABLE_ERROR_CODES` includes `CAPTCHA`

---

## 4. Login architecture

| Requirement | Implementation |
|-------------|----------------|
| Headed login default | `headlessDefault: false`; `openLoginBrowser` uses `headless: false` |
| Dedicated local profile | `BrowserProfileManager.resolveProfilePath(profileDirName)` under app `browserProfiles/` |
| No password collection | Login opens provider URL; user signs in manually |
| Session persistence | `launchPersistentContext(profilePath)` — cookies/storage persist across restarts |
| Profile isolation | Path traversal guard; per-account `profile_dir_name`; profile lock lease |

### Provider login URLs

| Provider | Login URL | Verify |
|----------|-----------|--------|
| Gemini (Google) | `startUrl` from account worker (Gemini / Google) | `probeSession`, `extractGeminiCookies` |
| ChatGPT | `https://chatgpt.com/` | `isChatGptLoggedIn` — prompt textarea visible |
| Meta AI | `https://www.meta.ai/` | `isMetaAiLoggedIn` — composer + no login button |

---

## 5. Test coverage

### Automated (unit)

**File:** `tests/unit/automation/browser-compatibility-patch.test.ts`

| Test | Proves |
|------|--------|
| Default patch options empty | Standard Playwright launch, no flags |
| GOOGLE_LOGIN_LAUNCH patch shape | Google-only launch extras documented |
| No stealth in `playwright-browser-ai-service` | ChatGPT/Meta login+verify don't use init scripts or `loginCompat` |
| Gemini session controller uses `loginCompat` only | Google patch scoped correctly |
| No stealth in runtime manager | Send path clean |
| Profile path isolation | Never escapes `browserProfiles/` |
| Verify selectors present | UI detection for ChatGPT/Meta/Gemini probe |

**Existing:** `tests/unit/automation/browser-engine-resolver.test.ts` — launch patch options, insecure-browser interstitial detection.

### Manual / extended (recommended before production)

| Scenario | Steps | Pass criteria |
|----------|-------|---------------|
| ChatGPT login + verify | Accounts → Add ChatGPT → Open browser → sign in → Verify | Status `READY`; prompt visible after restart |
| Meta AI login + verify | Same for Meta AI | Status `READY`; composer visible after restart |
| Gemini login + verify | Accounts → Open Google browser → sign in → Verify | Cookies extracted; Gemini usable |
| Persistent restart | Close app → reopen → Verify without re-login | Session survives in dedicated profile |
| Profile isolation | Confirm no writes to `%LOCALAPPDATA%\Google\Chrome\User Data` | Only app `browserProfiles/` touched |

**Smoke script:** `scripts/browser-conversation-smoke.ts` (live browser; run after manual login).

---

## 6. Provider matrix

| | Gemini | ChatGPT | Meta AI |
|---|--------|---------|---------|
| Init-script stealth | Never | **Removed** | **Removed** |
| `GOOGLE_LOGIN_LAUNCH` | Login only | No | No |
| Headed login default | Yes | Yes | Yes |
| Dedicated profile | Yes | Yes | Yes |
| Send uses runtime manager | Yes | Yes | Yes |
| CAPTCHA → user manual | Yes | Yes | Yes |

---

## 7. Files changed (Phase 8)

| File | Change |
|------|--------|
| `src/main/automation/browser-runner/browser-compatibility-patch.ts` | **New** — named patches |
| `src/main/automation/providers/playwright-stealth.ts` | **Deleted** |
| `src/main/services/playwright-browser-ai-service.ts` | Remove stealth + `loginCompat` from ChatGPT/Meta |
| `src/main/automation/browser-runner/launch-persistent-context.ts` | Import patches from new module |
| `tests/unit/automation/browser-compatibility-patch.test.ts` | **New** — architecture tests |
| `docs/BROWSER_COMPATIBILITY_AUDIT.md` | **New** — this document |

---

## 8. Operator troubleshooting

If Google shows "browser may not be secure" during **Gemini account login**:

1. Ensure login opened via Accounts (uses `GOOGLE_LOGIN_LAUNCH` automatically).
2. Try system browser preference (`browser-engine-resolver` — Edge/Chrome channel).
3. Advanced: set `NTS_DISABLE_AUTOMATION_CONTROLLED=1` (does not re-enable init-script stealth).

If ChatGPT/Meta login fails after Phase 8:

1. Complete sign-in manually in headed window.
2. Check UI selectors still match provider DOM (no stealth fallback).
3. Report selector drift — fix adapters, not stealth.

---

## Status

**Phase 8 complete:** stealth dependency removed from architecture. One documented opt-in launch patch remains for Google account login only.
