# NovelTrans Studio — Browser Automation

> Playwright-driven browser automation core. Gemini/Notebook provider logic stays **outside** `BrowserWorker`.

## 1. Goals

- Isolated Browser Runner (prefer `child_process`)
- Dedicated `launchPersistentContext(userDataDir)` per account — never Chrome default profile
- Command protocol: OPEN · NAVIGATE · GET_STATUS · SCREENSHOT · CLOSE · RESTART
- Structured errors + diagnostics (screenshot, limited HTML, URL, operation, timestamp)
- Retry transient failures; do **not** infinitely retry auth walls
- Provider-agnostic worker; `AutomationProvider` for Gemini/Notebook later
- Phase 19 diagnostics / selector overrides: see [`DIAGNOSTICS.md`](./DIAGNOSTICS.md)

## 2. Architecture

```
AutomationManager
  └── BrowserWorker (interface)
        ├── ChildProcessBrowserWorker  → spawn runner-entry (stdio JSON lines)
        └── InProcessBrowserWorker     → same BrowserSession (tests / fallback)
              └── BrowserSession
                    └── Playwright chromium.launchPersistentContext(profilePath)

AutomationProvider (interface)  ← Gemini/Notebook attach here later
  └── NOT imported by BrowserWorker
```

| Type | Role |
|------|------|
| `AutomationManager` | Owns workers; one per account profile; profile lock |
| `BrowserWorker` | Transport: send `AutomationCommand` → `AutomationResult` |
| `BrowserSession` | Playwright session + state machine |
| `AutomationCommand` | OPEN / NAVIGATE / GET_STATUS / SCREENSHOT / CLOSE / RESTART |
| `AutomationResult` | ok, state, data, errorCode, diagnostics |

### Process split

```
Main (Electron)                         Child (Node via ELECTRON_RUN_AS_NODE)
─────────────────                       ────────────────────────────────────
AutomationManager                       runner-entry.ts
  ChildProcessBrowserWorker               BrowserSession
    stdin  → JSON command line              Playwright persistent context
    stdout ← JSON result / events
```

Why child process: Playwright crash isolation, kill/restart, memory separation.

## 3. Profile paths

```
%APPDATA%/NovelTrans/browser-profiles/<workerId>/
```

- Created by account manager (Phase 4)
- `ProfileLockManager` prevents two Playwright instances on the same `userDataDir`
- Diagnostics: `%APPDATA%/NovelTrans/cache/automation/<workerId>/`

## 4. Browser state

| State | Meaning |
|-------|---------|
| `STOPPED` | No context |
| `STARTING` | Launching |
| `READY` | Idle, usable |
| `BUSY` | Command in flight |
| `USER_ACTION_REQUIRED` | Login / CAPTCHA / session expired |
| `ERROR` | Last command failed (non-auth) |

## 5. Command protocol

JSON lines. Request (`AutomationCommand`):

| type | Fields |
|------|--------|
| `OPEN` | `profilePath`, `headless?`, `startUrl?`, `diagnosticsDir?` |
| `NAVIGATE` | `url`, `timeoutMs?` |
| `GET_STATUS` | — |
| `SCREENSHOT` | `tag?` |
| `CLOSE` | — |
| `RESTART` | `startUrl?` |

Response (`AutomationResult`):

```json
{
  "id": "…",
  "ok": false,
  "state": "USER_ACTION_REQUIRED",
  "errorCode": "LOGIN_REQUIRED",
  "errorMessage": "Login required",
  "diagnostics": {
    "screenshotPath": "…/file.png",
    "htmlSnapshotPath": "…/file.html",
    "currentUrl": "https://…",
    "operationName": "NAVIGATE",
    "timestamp": "ISO-8601"
  }
}
```

**Never** include cookies, OAuth tokens, or Authorization headers in diagnostics. HTML snapshots are sanitized + capped (~64KB).

## 6. Error taxonomy

| Code | Retry? |
|------|--------|
| `NAVIGATION_TIMEOUT` | yes (transient) |
| `NETWORK_ERROR` | yes |
| `RESPONSE_TIMEOUT` | yes |
| `UNKNOWN_UI` | yes (limited) |
| `SELECTOR_NOT_FOUND` | no |
| `LOGIN_REQUIRED` | no |
| `CAPTCHA` | no |
| `SESSION_EXPIRED` | no |
| `QUOTA_LIMIT` | no |

`RetryPolicy`: exponential backoff, default max 3 attempts. Auth errors stop immediately.

## 7. AutomationProvider interface

```typescript
interface AutomationProvider {
  readonly providerId: string;
  attach(session: BrowserSession): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
  detach(): Promise<void>;
}
```

Gemini selectors / prompt send live under `providers/google/` in a later phase.  
**Do not** put Gemini logic inside `BrowserWorker` or `BrowserSession`.

## 8. Directory layout

```
src/main/automation/
├── automation-manager.ts
├── browser-session.ts
├── browser-worker.ts
├── in-process-browser-worker.ts
├── protocol.ts
├── types.ts
├── diagnostics.ts
├── errors/automation-errors.ts
├── providers/
│   ├── automation-provider.ts
│   └── browser-provider.ts          # legacy stub
└── browser-runner/
    ├── runner-entry.ts              # child process entry
    ├── runner-host.ts               # ChildProcessBrowserWorker
    ├── profile-manager.ts
    └── profile-lock.ts
```

## 9. Build

Forge Vite builds `runner-entry.ts` → `.vite/build/runner-entry.js` next to `main.js`.  
Child spawn: `process.execPath` + `ELECTRON_RUN_AS_NODE=1`.

## 10. Testing

Fixtures: `tests/fixtures/automation/*.html` served on localhost.

Coverage:

- Command round-trip (OPEN → … → CLOSE)
- Persistent profile directory
- Timeout / network failure diagnostics
- LOGIN_REQUIRED (no infinite retry)
- Profile lock isolation
- RetryPolicy unit tests
- HTML sanitize (no tokens)

Run: `npm test` (requires Playwright Chromium: `npx playwright install chromium`).

## 11. Implementation status

| Item | Status |
|------|--------|
| BrowserSession + commands | ✅ |
| AutomationManager | ✅ |
| Child + in-process workers | ✅ |
| Retry + diagnostics | ✅ |
| AutomationProvider interface | ✅ (no Gemini yet) |
| GeminiBrowserProvider | Playwright chat send (Phase 12) |
| NotebookProvider | Playwright NotebookLM (Phase 11) |
