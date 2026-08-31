# NovelTrans Studio — Architecture

> Windows desktop app for AI-assisted **multilingual** novel translation.  
> Local-first SQLite, multiple target editions, Gemini / ChatGPT / Meta AI via one provider-neutral pipeline.

## 1. Design Principles

| Principle | Implementation |
|-----------|----------------|
| SQLite is source of truth | All project, term, memory, job state persisted locally |
| Provider abstraction | `IAIProvider` + `AiProviderManager` — swap Gemini / ChatGPT / Meta / Web API without touching Translation Engine |
| Provider-neutral packs | `TranslationPackDto` built from project language pair + memory; same shape for every provider |
| Process isolation | Browser automation + Python Gemini worker run outside renderer |
| Security by default | `contextIsolation`, `sandbox`, Zod-validated IPC, `safeStorage` for secrets |
| Resumable jobs | State machine persisted to DB; crash-safe |
| Multi-backend AI | Playwright browser (Gemini, ChatGPT, Meta AI) and/or Gemini Web API worker |

## 2. Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                        │
│  lifecycle · db · credentials · jobs · AI Provider Manager       │
└────┬──────────────────────┬─────────────────────┬───────────────┘
     │ contextBridge        │ spawn               │ HTTP 127.0.0.1
     ▼                      ▼                     ▼
┌──────────────┐   ┌──────────────────┐   ┌─────────────────────┐
│ Renderer     │   │ Browser Runner   │   │ Gemini Web API      │
│ React        │   │ Playwright       │   │ Python worker       │
└──────────────┘   └──────────────────┘   └─────────────────────┘
```

### Main Process Responsibilities

- Application lifecycle (`app.ready`, single-instance lock, quit hooks)
- SQLite connection + migrations
- Repository layer (only layer that executes SQL)
- Service layer (business logic, orchestration)
- Job Manager + Scheduler (multi-account, quota-aware)
- AI Provider Manager (Gemini / ChatGPT / Meta AI / Web API selection + fallback)
- Browser Runner Manager (spawn/kill/monitor child processes)
- Gemini Web API WorkerProcessManager (Python FastAPI on 127.0.0.1)
- Credential Store (`safeStorage` encrypt/decrypt)
- Local knowledge cache + optional NotebookLM grounding (no Google Drive sync)
- IPC router with Zod validation
- Structured logging + diagnostics export

### Renderer Responsibilities

- React UI (Dashboard, Projects, Translation editor, Terms, Characters, Accounts, Jobs, Settings, Logs)
- Call typed APIs exposed via preload only
- Zustand for ephemeral UI state (selection, panel layout, filters)
- No filesystem, no DB, no Playwright, no secrets

### Preload Responsibilities

- `contextBridge.exposeInMainWorld('novelTrans', api)`
- Thin typed wrappers around `ipcRenderer.invoke`
- No business logic

### Browser Runner (Child Process)

- One process can host one or more Playwright contexts (configurable)
- Each account → persistent `userDataDir` at:
  `{userData}/NovelTrans/browser-profiles/{profileDirName}/`
  (Google Gemini workers and generic AI browser accounts use separate profile dirs — never the OS default Chrome profile)
- Communicates with main via structured messages (JSON over stdio or Node IPC)
- Actions: launch, navigate, send prompt, scrape response, screenshot, health check
- On login/2FA/CAPTCHA: emit `NEEDS_ATTENTION`, pause job

## 3. Layered Architecture

```
┌──────────────────────────────────────────────────────────┐
│ UI Layer          │ React pages + components            │
├───────────────────┼──────────────────────────────────────┤
│ IPC Layer         │ channels · schemas · handlers        │
├───────────────────┼──────────────────────────────────────┤
│ Service Layer     │ project · translation · terms · jobs │
├───────────────────┼──────────────────────────────────────┤
│ Repository Layer  │ SQL access only                      │
├───────────────────┼──────────────────────────────────────┤
│ Infrastructure    │ db · fs · logger · credentials · knowledge cache │
├───────────────────┼──────────────────────────────────────┤
│ Automation Layer  │ browser-runner · providers           │
└──────────────────────────────────────────────────────────┘
```

**Dependency rule:** upper layers depend on interfaces; repositories and providers are injected or resolved via small DI container / factory in main.

## 4. Module Boundaries

### `src/shared/`

Cross-process types, Zod schemas, constants, pure utilities. No Electron, no React, no SQL.

### `src/main/db/`

- `connection.ts` — open SQLite, pragma, WAL mode
- `migrations/` — numbered SQL migrations, never destructive without explicit migration step
- `repositories/` — one repo per aggregate (Project, Chapter, Paragraph, Term, Character, Job, Account, Memory)

### `src/main/services/`

| Service | Scope |
|---------|-------|
| `ProjectService` | CRUD projects, metadata, style settings |
| `ImportService` | TXT/EPUB/DOCX → chapters + stable paragraph IDs |
| `ChapterService` | Splitting, paragraph addressing |
| `TranslationService` | Source/target text, batch assembly |
| `TermService` | Global/Genre/User/Project/Context terms, promotion flow |
| `CharacterService` | Character DB + relationships |
| `MemoryService` | Novel memory, story state, relationship memory |
| `JobService` | Create/resume/cancel jobs, state transitions |
| `SchedulerService` | Multi-account worker assignment, quota failover |
| `NotebookSyncService` | Rebuild local knowledge markdown; optional Notebook version probe |
| `BackupService` | Full DB + config backup/restore |
| `ExportService` | TXT/DOCX/EPUB export |
| `AccountService` | Google account registry + AI browser account registry (unified UI) |
| `DiagnosticsService` | Log bundle, health checks |

### `src/main/source-folder/` (folder import + metadata)

| Module | Role |
|--------|------|
| `folder-scanner.ts` | Scan TXT folder → chapters, metadata, documents, classified files |
| `source-file-classifier.ts` | BOOK_METADATA / DOCUMENT / PROLOGUE / CHAPTER / UNKNOWN |
| `book-info-parser.ts` | Parse `_BOOK_INFO.txt` (VI / ZH / EN keys) |
| `book-metadata-service.ts` | Apply metadata, conflict detection, user-edit priority |
| `book-profile-builder.ts` | Compact `[BOOK PROFILE]` + `00_BOOK_PROFILE.md` |
| `source-folder-service.ts` | IPC orchestration, watcher, resync, import |
| `chapter-file-detector.ts` | Filename + heading chapter detection |

SQLite remains source of truth; local knowledge files + optional NotebookLM research grounding are an **optional** AI context layer. See [BOOK_METADATA.md](./BOOK_METADATA.md) and [NOTEBOOK_ARCHITECTURE.md](./NOTEBOOK_ARCHITECTURE.md).

## 4a. AI execution architecture

All translation and repair calls follow one path:

```
Translation Engine (BatchPlanner / BatchExecutor / OutputParser)
        ↓
Ai Routing (AiProviderManager — priority, capabilities, fallback)
        ↓
Execution Target
├── Gemini — Playwright browser and/or Gemini Web API worker
├── ChatGPT — Playwright browser (dedicated profile, user login)
└── Meta AI — Playwright browser (dedicated profile, user login)
        ↓
Provider-neutral TranslationPack (prompt, language pair, terms, memory, source paragraphs)
```

**Key modules:** `ai-provider-manager.ts`, `execution-worker-resolver.ts`, `provider-capabilities.ts`, `playwright-browser-ai-service.ts`, `gemini-service.ts`.

Jobs store `executionTarget` (provider + account kind + account id). ChatGPT and Meta jobs run with **zero Google accounts** when configured.

See [AI_PROVIDER.md](./AI_PROVIDER.md), [MULTI_PROVIDER_ACCEPTANCE.md](./MULTI_PROVIDER_ACCEPTANCE.md).

## 4b. Account model

NovelTrans uses two persistence families behind one Accounts UI:

| Kind | Storage | Used for | Login |
|------|---------|----------|-------|
| **Google account** | `worker_states` + browser profile | Playwright Gemini, optional NotebookLM research | Headed Google/Gemini browser; manual CAPTCHA/2FA |
| **AI browser account** | `ai_accounts` + browser profile | ChatGPT, Meta AI Playwright providers | Headed provider URL; manual sign-in |

**Why UI unifies them:** operators think in terms of "connected AI" — one place to add, verify, and delete accounts regardless of backend.

**Why persistence stays separate:** Google workers predate multi-provider schema; Gemini cookies, worker leases, and Notebook mappings attach to Google rows. ChatGPT/Meta use `ai_accounts.profile_dir_name` and do not require Google sign-in.

**Google account is not globally required.** Projects routed to ChatGPT or Meta AI only need a READY row in `ai_accounts` for that provider. Gemini paths (Playwright or Web API) still need Google session or cookies as today.

No passwords stored. Sessions live in isolated Chromium profiles under `%APPDATA%\NovelTrans\browser-profiles\`.

## 4c. Research Notebook (optional)

NotebookLM is **research / optional grounding** — not the default critical path for translation.

| Mode | Role |
|------|------|
| **Local knowledge cache** | Default — SQLite → markdown `00–08` under app cache; always available |
| **Research Notebook** | Optional NotebookLM upload for richer grounding |
| **Legacy Translation Notebook** | Deprecated — local-context pack used instead when mapping absent |

Core translate flow: build `TranslationPack` from SQLite + local knowledge → send via chosen AI provider. Notebook provision/sync is best-effort before jobs; failure falls back to local context.

See [NOTEBOOK_ARCHITECTURE.md](./NOTEBOOK_ARCHITECTURE.md).

## 4d. Commercial licensing

| Capability | Status |
|------------|--------|
| In-app license key / entitlement check | **NOT IMPLEMENTED** |
| Billing / subscription | **NOT IMPLEMENTED** |
| Marketing website integration | **NOT IMPLEMENTED** |

Application is **UNLICENSED** in `package.json`. No fake license gates in code.


### `src/main/jobs/`

- `JobStateMachine` — valid transitions, persist on every change
- `JobManager` — in-memory queue backed by DB
- `BatchPlanner` — chunk paragraphs into translation batches
- `BatchExecutor` — send → wait → parse → QA → repair loop
- `QAChecker` — local deterministic checks (no AI)
- `OutputParser` — parse `<TRANSLATION>`, `<TERM_DELTA>`, `<MEMORY_DELTA>`

### `src/main/automation/`

```
automation/
├── browser-runner/
│   ├── runner-entry.ts       # child process entry
│   ├── runner-host.ts        # main-side process manager
│   ├── message-protocol.ts
│   └── profile-manager.ts
└── providers/
    ├── browser-provider.ts   # interface
    ├── provider-registry.ts
    └── google/
        ├── selectors/        # centralized selectors
        ├── gemini-provider.ts
        └── notebook-provider.ts
```

**Selector policy:** prefer `getByRole`, `getByLabel`, accessible name. CSS only as last resort. All selectors live under `providers/google/selectors/`.

### `src/main/ipc/`

- `channels.ts` — channel name constants
- `schemas/` — Zod request/response per channel
- `handlers/` — thin handlers delegating to services
- `register-handlers.ts` — single registration point

### `src/renderer/`

```
renderer/
├── pages/          # route-level views matching sidebar
├── components/     # reusable UI
├── layouts/        # AppShell, Sidebar
├── stores/         # Zustand slices
├── hooks/          # useIpc, useJobProgress, etc.
└── styles/         # theme tokens, dark/light
```

## 5. IPC Model

All IPC uses **`invoke/handle`** (request/response). No `send/on` for critical flows except job progress events (one-way, main → renderer).

### Channel Naming

`domain:action` — e.g. `project:list`, `job:create`, `account:open-login-browser`

### Validation Flow

```
Renderer → preload.invoke(channel, payload)
         → main handler
         → Zod.parse(payload)
         → Service.method()
         → Zod.parse(response) optional
         → return to renderer
```

### Event Channels (main → renderer)

| Event | Payload |
|-------|---------|
| `job:progress` | `{ jobId, state, progress, message }` |
| `job:needs-attention` | `{ jobId, workerId, reason, screenshotPath? }` |
| `log:entry` | structured log line for live log viewer |

See [IPC reference in PROJECT_STATE.md](./PROJECT_STATE.md) for full channel list (to be expanded per phase).

## 6. Job System Architecture

### State Machine

```
QUEUED → PREPARING → WAITING_WORKER → SENDING → WAITING_AI
  → PARSING → QA → (REPAIRING ↔ SENDING)* → COMPLETED

Branches: PAUSED, NEEDS_ATTENTION, FAILED, CANCELLED
```

Every transition writes to `jobs` + `job_events` tables.

### Multi-Account Scheduling

```
Scheduler
  ├── WorkerPool (Google workers + AI browser accounts — one active job per profile)
  ├── QuotaTracker (rate limits per account, configurable)
  └── Policy: pause | switch-worker | queue
```

### Batch Loop

1. `BatchPlanner` selects paragraphs by batch config
2. Build prompt with: source text, locked terms, memory context, style
3. `BatchExecutor` assigns worker, sends via provider
4. `OutputParser` extracts structured response
5. `QAChecker` runs local checks
6. If gaps → `REPAIRING` with missing paragraph IDs only
7. Persist deltas (terms, memory) through services
8. Next batch or `COMPLETED`

## 7. Memory & Term Architecture

### Term Promotion Pipeline

```
DISCOVERED → CANDIDATE → PROJECT_VERIFIED → GENRE_VERIFIED → GLOBAL_VERIFIED → LOCKED
```

AI-discovered terms enter at `DISCOVERED` or `CANDIDATE`. Never auto-promote to `GLOBAL_VERIFIED`.

### Memory Types

| Type | Scope | Storage |
|------|-------|---------|
| Global Term Vault | app-wide | `terms` (scope=GLOBAL) |
| Genre Term | per genre tag | `terms` (scope=GENRE) |
| User Term | user override | `terms` (scope=USER) |
| Project Term | per novel | `terms` (scope=PROJECT) |
| Context Term | batch/ephemeral | `terms` (scope=CONTEXT) |
| Novel Memory | per project | `project_memory` |
| Character DB | per project | `characters`, `character_aliases` |
| Relationship Memory | per project | `character_relationships` |
| Story State | per project | `story_state` |
| Translation Style | per project | `projects.style_config` |

### Local knowledge & portability

- **SQLite** is authoritative for terms, memory, translations, jobs
- **NotebookKnowledgeBuilder** writes `00–08` markdown under `%APPDATA%/NovelTrans/cache/knowledge/{projectId}/`
- After each learning PASS, local knowledge version bumps immediately (Phase 7)
- **Backups:** daily ZIP via `VACUUM INTO` + tiered retention (Phase 8) — see [PORTABILITY.md](./PORTABILITY.md)
- **Legacy Drive tables** (`drive_resources`, `drive_sync_state`) remain for opening old databases only — no runtime Drive API (Phase 9)

## 8. Import / Paragraph ID Strategy

1. Parse file (TXT/EPUB/DOCX) → raw text (stream large TXT; encoding UTF-8 / BOM / GB18030|GBK)
2. `ChapterDetector` multi-detector pipeline (confidence) → preview before commit
3. User may edit titles / exclude chapters / add manual split offsets
4. Normalize whitespace (preserve content) → paragraph segmentation
5. Assign IDs: `[C{chapter:06d}:P{paragraph:06d}]` — from sequential chapter number at commit; **not** from title
6. Store `source_hash` (SHA-256) on chapter + paragraph; flag duplicate titles/hashes in preview
7. No translation during import

See `docs/IMPORT.md`.

## 9. Security Model

| Asset | Protection |
|-------|------------|
| OAuth tokens | `safeStorage` encrypted blob in `credentials` table |
| Browser cookies | Playwright persistent context in isolated profile dir |
| Google password | Never stored |
| Client secrets | Env / local config outside git |
| IPC input | Zod strict schemas |
| Renderer | sandbox + no nodeIntegration |

## 10. Logging & Diagnostics

- Structured JSON logs (pino or winston) → rotating files in `{userData}/logs/`
- Redact tokens/cookies/passwords at logger layer
- Diagnostics bundle: logs + job snapshot + anonymized config export

## 11. Provider Swappability

Production providers implement `IAIProvider` and receive the same `TranslationPackDto`:

| Provider type | Transport |
|---------------|-----------|
| `PLAYWRIGHT_GEMINI` | Playwright → Gemini web UI |
| `GEMINI_WEB_API` | HTTP → Python worker on 127.0.0.1 |
| `PLAYWRIGHT_CHATGPT` | Playwright → chatgpt.com |
| `PLAYWRIGHT_META_AI` | Playwright → meta.ai |
| `GEMINI_OFFICIAL` | Reserved / disabled |

Job system depends on `AiProviderManager`, not Gemini-specific code paths.

## 12. Release readiness (architecture view)

**Not production-ready** until live provider E2E passes. Documented blockers:

| Area | Gap |
|------|-----|
| Live browser E2E | ChatGPT / Meta / Gemini smoke NOT_RUN in CI |
| Send confirmation | Unit harness only |
| Response anchoring | DOM-dependent; needs live verification |
| Crash recovery | `ai_requests` planner wired for Gemini; ChatGPT/Meta partial |
| Code signing / updates | Optional signing; placeholder update server |
| Licensing | NOT IMPLEMENTED — no enforcement |

See [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md), [PROJECT_STATE.md](./PROJECT_STATE.md).

## 13. Development Phases

| Phase | Focus | Exit Criteria |
|-------|-------|---------------|
| **0 — Scaffold** | Electron Forge, TS strict, empty UI shell, IPC ping, DB open | App launches, typecheck passes |
| **1 — Data Foundation** | Migrations, repositories, project CRUD | Create/list projects in UI |
| **2 — Import Pipeline** | TXT/EPUB/DOCX import, chapter split, paragraph IDs | Import file, view chapters |
| **3 — Terms & Memory** | Term vault, promotion UI, character DB | CRUD terms/characters |
| **4 — Google Accounts** | Profile dirs, manual login flow, session reuse | Add account, session persists |
| **5 — Browser Automation Core** | Runner process, GeminiProvider skeleton, screenshots | Navigate Gemini logged in |
| **6 — Job System** | State machine, batch planner, scheduler | Job runs end-to-end with mock provider |
| **7 — Translation Loop** | Prompt builder, output parser, QA, repair | Real translation batch completes |
| **8 — Notebook Integration** | Optional NotebookLM research grounding | Local knowledge default; Notebook optional |
| **9 — Editor & Export** | Parallel CN/VN editor, TXT/DOCX/EPUB export | Edit and export novel |
| **10 — Local backup** | Atomic backup, portability, export bundles | Backup/restore without Drive |
| **11 — Installer & Polish** | Squirrel installer, diagnostics, settings | Installable Windows build |

## 14. Folder Structure

See [PROJECT_STATE.md](./PROJECT_STATE.md) for the canonical directory tree.

## 15. Key Risks

| Risk | Mitigation |
|------|------------|
| Gemini UI changes break selectors | Centralized selectors, health checks, screenshot-on-failure, provider version pinning |
| Google ToS / automation | User-owned accounts, manual login, pause on CAPTCHA, no credential harvesting |
| Quota exhaustion | Multi-account scheduler, configurable pause/switch |
| better-sqlite3 native rebuild | `@electron/rebuild` in postinstall, CI matrix |
| Large novel performance | Batch sizing, indexed paragraph queries, WAL mode |
| Session expiry | Detect login page, transition to NEEDS_ATTENTION |
