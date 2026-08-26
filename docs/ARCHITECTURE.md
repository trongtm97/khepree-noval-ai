# NovelTrans Studio — Architecture

> Desktop Windows app for Chinese → Vietnamese novel translation via browser-automated Gemini/Notebook, using the user's own Google accounts.

## 1. Design Principles

| Principle | Implementation |
|-----------|----------------|
| SQLite is source of truth | All project, term, memory, job state persisted locally |
| Provider abstraction | `IAIProvider` → Playwright Gemini / Gemini Web API / future Official; swap AI backend without touching Translation Engine |
| Process isolation | Browser automation + Python Gemini worker run outside renderer |
| Security by default | `contextIsolation`, `sandbox`, Zod-validated IPC, `safeStorage` for secrets |
| Resumable jobs | State machine persisted to DB; crash-safe |
| Multi-backend AI | Default flows may use Playwright web UI **or** Gemini Web API worker; Official API optional later |

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
- AI Provider Manager (Playwright Gemini + Gemini Web API selection / fallback)
- Browser Runner Manager (spawn/kill/monitor child processes)
- Gemini Web API WorkerProcessManager (Python FastAPI on 127.0.0.1)
- Credential Store (`safeStorage` encrypt/decrypt)
- Google Drive OAuth (official `googleapis` client)
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
- Each Google Account → persistent `userDataDir` at:
  `{userData}/NovelTrans/browser-profiles/{workerId}/`
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
│ Infrastructure    │ db · fs · logger · credentials · drive│
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
| `DriveSyncService` | Upload/download memory snapshots via Drive API |
| `BackupService` | Full DB + config backup/restore |
| `ExportService` | TXT/DOCX/EPUB export |
| `AccountService` | Google account registry, worker binding |
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

SQLite remains source of truth; Notebook/Drive files are AI knowledge layer. See [BOOK_METADATA.md](./BOOK_METADATA.md).

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
  ├── WorkerPool (1 worker = 1 Google account + 1 browser profile)
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

### Drive Sync

- Memory snapshots exported as JSON to Drive folder (OAuth)
- Notebook uses same Drive files as knowledge source (automation uploads + links in Notebook UI)
- Local DB remains authoritative; Drive is backup + Notebook input

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

```typescript
interface BrowserProvider {
  readonly id: string;
  launch(ctx: ProviderContext): Promise<void>;
  sendTranslationRequest(req: TranslationRequest): Promise<RawProviderResponse>;
  healthCheck(): Promise<ProviderHealth>;
  dispose(): Promise<void>;
}
```

Future providers (e.g. Claude web, local LLM UI) implement same interface. Job system depends on `BrowserProvider`, not Gemini specifics.

## 12. Development Phases

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
| **8 — Notebook Integration** | NotebookProvider, Drive knowledge files | Notebook-backed translation works |
| **9 — Editor & Export** | Parallel CN/VN editor, TXT/DOCX/EPUB export | Edit and export novel |
| **10 — Drive Sync & Backup** | Memory sync, backup/restore | Sync + restore verified |
| **11 — Installer & Polish** | Squirrel installer, diagnostics, settings | Installable Windows build |

## 13. Folder Structure

See [PROJECT_STATE.md](./PROJECT_STATE.md) for the canonical directory tree.

## 14. Key Risks

| Risk | Mitigation |
|------|------------|
| Gemini UI changes break selectors | Centralized selectors, health checks, screenshot-on-failure, provider version pinning |
| Google ToS / automation | User-owned accounts, manual login, pause on CAPTCHA, no credential harvesting |
| Quota exhaustion | Multi-account scheduler, configurable pause/switch |
| better-sqlite3 native rebuild | `@electron/rebuild` in postinstall, CI matrix |
| Large novel performance | Batch sizing, indexed paragraph queries, WAL mode |
| Session expiry | Detect login page, transition to NEEDS_ATTENTION |
