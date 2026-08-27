# NovelTrans Studio — Browser Automation

> Playwright-driven browser automation core. Gemini/Notebook provider logic stays **outside** `BrowserWorker`.

## 1. Goals

- Isolated Browser Runner via **Electron `utilityProcess.fork()`** (not `ELECTRON_RUN_AS_NODE`)
- Dedicated `launchPersistentContext(userDataDir)` per account — never Chrome default profile
- Typed message protocol: `requestId` · `command` · `result` · `error`
- Lifecycle: spawn · ready · crash · timeout · restart · dispose
- Structured errors + diagnostics (screenshot, limited HTML, URL, operation, timestamp)
- Retry transient failures; do **not** infinitely retry auth walls
- Provider-agnostic worker; `AutomationProvider` for Gemini/Notebook later
- Phase 19 diagnostics / selector overrides: see [`DIAGNOSTICS.md`](./DIAGNOSTICS.md)

## 2. Architecture

```
AutomationManager
  └── BrowserWorker (interface)
        ├── UtilityProcessBrowserWorker  → utilityProcess.fork(runner-entry)
        └── InProcessBrowserWorker       → same BrowserSession (tests / fallback)
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
Main (Electron)                              Utility process (Node + parentPort)
─────────────────                            ───────────────────────────────────
AutomationManager                            runner-entry.ts
  UtilityProcessBrowserWorker                  BrowserSession
    postMessage → { type:request,              Playwright persistent context
                    requestId, command }
    on('message') ← { type:response,
                      requestId, result|error }
                    | { type:event, runner_ready }
```

**Why not `ELECTRON_RUN_AS_NODE`?**  
Packaged builds keep fuse `RunAsNode=false` (security). Spawning `process.execPath` with that env var is ignored / broken.  
`utilityProcess.fork()` is the supported child runtime that works with the fuse off.

Why separate process: Playwright crash isolation, kill/restart, memory separation from Main.

### Lifecycle

| Event | Host behavior |
|-------|----------------|
| spawn | `utilityProcess.fork(runner-entry.js)` |
| ready | Wait for `{ type:'event', event:'runner_ready' }` (timeout → reject) |
| crash / exit | Reject **all** pending requests with clear error; state `STOPPED` |
| timeout | Per-request timer rejects that requestId |
| restart | Kill child, fail pending, fork again on next send |
| dispose | Best-effort CLOSE, kill, fail pending |

## 3. Profile paths

```
%APPDATA%/NovelTrans/browser-profiles/<workerId>/
```

- Created by account manager (Phase 4)
- `ProfileLockManager` prevents two Playwright instances on the same `userDataDir`
- Diagnostics: `%APPDATA%/NovelTrans/cache/automation/<workerId>/`
- **Never** use the OS default Edge/Chrome user profile — only NovelTrans dedicated dirs

### Browser engine (Windows)

`BrowserEngineResolver` + `launchNovelTransPersistentContext` (single launch entry).

| Preference | Behavior |
|------------|----------|
| `AUTO` (default) | Microsoft Edge Stable → Google Chrome Stable → Playwright Chromium |
| `EDGE` | Require Edge (`channel: 'msedge'`) |
| `CHROME` | Require Chrome (`channel: 'chrome'`) |
| `PLAYWRIGHT_CHROMIUM` | Bundled Chromium (no channel) |

Config:

- Env `NTS_BROWSER_ENGINE=AUTO|EDGE|CHROME|PLAYWRIGHT_CHROMIUM`
- Advanced anti-detect **OFF by default**. Opt-in: `NTS_DISABLE_AUTOMATION_CONTROLLED=1` (adds `--disable-blink-features=AutomationControlled`)
- Playwright **1.62.1**
- Headed default (`headless: false`) for Gemini / Notebook / account open; diagnostics probes may pass `headless: true` explicitly
- Each launch writes `engine-info.json` under the diagnostics dir; failure diagnostics include `browserEngine` / `playwrightVersion` / `browserChannel`

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

### UtilityProcess IPC (typed)

Host → child:

```json
{ "type": "request", "requestId": "…", "command": { "id": "…", "type": "OPEN", "profilePath": "…" } }
```

Child → host:

```json
{ "type": "response", "requestId": "…", "result": { "id": "…", "ok": true, "state": "READY" } }
```

```json
{ "type": "response", "requestId": "…", "error": { "message": "…", "code": "UNKNOWN_UI" }, "result": { … } }
```

```json
{ "type": "event", "event": "runner_ready", "payload": { "pid": 12345 } }
```

### Automation commands

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
| `PROMPT_TOO_LARGE` | no |
| `SEND_NOT_CONFIRMED` | no (provider may retry send once internally) |
| `RESPONSE_NOT_FOUND` | no |
| `RESPONSE_AMBIGUOUS` | no |
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

Gemini selectors / prompt send live under `providers/google/`.  
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
│   └── google/…
└── browser-runner/
    ├── runner-entry.ts              # utilityProcess entry (parentPort)
    ├── runner-host.ts               # UtilityProcessBrowserWorker
    ├── runner-path.ts               # ASAR / unpacked path resolve
    ├── runner-smoke.ts              # OPEN→STATUS→SCREENSHOT→CLOSE
    ├── profile-manager.ts
    ├── profile-lock.ts
    ├── browser-engine-resolver.ts
    ├── browser-engine-config.ts
    ├── launch-persistent-context.ts
    └── browser-session-controller.ts
```

## 9. Build & fuses

Forge Vite builds `runner-entry.ts` → `.vite/build/runner-entry.js` next to `main.js`.

Packaging (`forge.config.ts`):

- `asar.unpack: '**/{*.node,runner-entry.js}'` — natives + optional runner unpack
- Path resolver tries: `__dirname/runner-entry.js` → `app.asar.unpacked/…` → `resources/runner-entry.js`
- Vite Forge only ships `.vite/` by default — `hooks.packageAfterCopy` copies production externals (`playwright`, `better-sqlite3`, …) into the package so `utilityProcess` / main can `require()` them
- **Fuse `RunAsNode=false`** — do **not** flip to true to “fix” the runner

```ts
[FuseV1Options.RunAsNode]: false,
```

## 10. Testing

Fixtures: `tests/fixtures/automation/*.html` served on localhost.

Coverage:

- Command round-trip (OPEN → … → CLOSE)
- Typed utilityProcess protocol (`requestId` / result / error)
- Runner path ASAR candidates
- Persistent profile directory
- Timeout / network failure diagnostics
- LOGIN_REQUIRED (no infinite retry)
- Profile lock isolation
- BrowserEngineResolver (AUTO/Edge/Chrome/Chromium)
- RetryPolicy unit tests
- HTML sanitize (no tokens)

### Smoke (packaged exe)

```bash
npm run package
npm run smoke:runner:packaged
# or one-shot (packages then smokes):
npm run smoke:runner
```

Launches `NovelTransStudio.exe --nts-smoke-runner` → OPEN / GET_STATUS / SCREENSHOT / CLOSE (headless).  
Stdout marker: `SMOKE_RUNNER_PASS`. Exit `0` = packaged PASS.

### Dev

```bash
npm start
# Runner uses utilityProcess.fork against .vite/build/runner-entry.js
```

Unit: `npm test` (requires Playwright Chromium: `npx playwright install chromium`).

## 11. Implementation status

| Item | Status |
|------|--------|
| BrowserSession + commands | ✅ |
| AutomationManager | ✅ |
| UtilityProcessBrowserWorker (RunAsNode=false) | ✅ |
| In-process worker (tests) | ✅ |
| Retry + diagnostics | ✅ |
| BrowserEngineResolver + headed default | ✅ |
| Packaged smoke (`--nts-smoke-runner`) | ✅ |
| AutomationProvider interface | ✅ |
| GeminiBrowserProvider | Playwright chat send (Phase 12) |
| NotebookProvider | Playwright NotebookLM (Phase 11) |
