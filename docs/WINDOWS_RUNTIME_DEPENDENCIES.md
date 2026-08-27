# Windows runtime dependencies (self-contained)

NovelTrans Studio on Windows must run for end users **without** installing Node, npm, or Python.

## What the installer ships

| Component | Location in packaged app | Required? |
|-----------|--------------------------|-----------|
| Electron app + main/preload/renderer | app.asar / unpacked runner | Yes |
| Playwright library (`playwright`, `playwright-core`) | `resources/app/.../node_modules` (via Forge copy) | Yes (Browser provider) |
| Guides | `resources/guides` | Docs only |
| Gemini Web API worker | `resources/workers/NovelTransGeminiWorker.exe` | **Optional** |

User data (DB, profiles, venv for **dev only**) stays under `%APPDATA%` / configured data path — never under the install directory.

## A. Browser provider (Playwright)

### Resolution order (`BrowserEngineResolver` / `BrowserDependencyHealth`)

1. **Microsoft Edge Stable** (if `msedge.exe` exists)
2. **Google Chrome Stable** (if `chrome.exe` exists)
3. **Playwright Chromium** — only if the Chromium **executable file exists on disk**

Packaged builds do **not** tell users to run `npx playwright install`.  
If no Edge/Chrome/Chromium binary is usable, the UI/error text asks the user to install Edge or Chrome.

### Clean-machine expectation

- Machine has Edge or Chrome (typical Windows) → Browser provider is usable.
- Machine has neither and no Playwright Chromium cache → Browser provider unavailable; **app still launches**; Web API may still work if worker exe is present.

### Dev note

Developers may still run `npx playwright install chromium` for local Chromium-only tests. That path is never shown to production users.

## B. Gemini Web API worker

| Environment | How worker starts |
|-------------|-------------------|
| **Development** | `workers/gemini_webapi_worker/main.py` + Python 3.11+ venv under userData (`WorkerProcessManager` install flow) |
| **Production** | Spawn `resources/workers/NovelTransGeminiWorker.exe` (PyInstaller one-file). No system Python. |

Build the exe on a Windows build machine:

```bash
npm run build:gemini-worker
```

Output: `resources/workers/NovelTransGeminiWorker.exe`  
Forge `extraResource` includes `./resources/workers` (README + exe). Do not ship `.venv`, cookies, or private env files.

If the exe is missing in a release:

- App still opens
- Browser provider still works (with Edge/Chrome)
- Web API reports not installed; install button explains packaging gap (no “install Python” for end users)

## C. Forge packaging

- `packagerConfig.extraResource`: `./resources/guides`, `./resources/workers`
- `packageAfterCopy`: copies `playwright` / `better-sqlite3` into the packaged tree (Vite Forge would otherwise omit them)
- Fuses: `RunAsNode` remains **false**; browser automation uses `utilityProcess.fork`

## D. Installer smoke (clean Windows user profile)

Simulate: no Node, no npm, no Python on PATH for the **runtime** user (build machine may still have them).

Checks:

1. App process starts (`NovelTransStudio.exe`)
2. Browser dependency health: usable if Edge/Chrome present
3. If `NovelTransGeminiWorker.exe` is in `resources/workers` and Web API enabled → worker process can start and answer `/health`
4. If worker missing → app remains usable with Browser provider only

Scripts:

```bash
npm run build:gemini-worker   # once per release (build machine)
npm run package               # or make
npm run smoke:runner:packaged
npm run smoke:runtime-deps
```

## E. Optional provider degradation

AI Provider Manager keeps Gemini Browser as a fallback. Missing Web API worker must not block:

- App boot
- Account browser login flows
- Jobs that can run on Browser provider

## Related code

- `src/main/automation/browser-runner/browser-dependency-health.ts`
- `src/main/automation/browser-runner/browser-engine-resolver.ts`
- `src/main/ai/worker-process-manager.ts`
- `scripts/build-gemini-worker.mjs`
- `forge.config.ts`
