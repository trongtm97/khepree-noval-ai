# Google Drive Removal Audit — Phase 1

**Date:** 2026-08-28  
**Scope:** Audit only — no production code deleted in this phase.  
**Goal:** Inventory every Google Drive dependency, classify removal strategy, map critical path, record baseline test status.

---

## Executive Summary

Khepree Novel AI has **~110 files** touching Google Drive directly or indirectly across main process, SQLite schema, IPC, renderer UI, tests, docs, and resources.

| Layer | Role today | After Drive removal |
|-------|------------|---------------------|
| **SQLite / local files** | Source of truth (already) | Unchanged — sole SoT |
| **Local Knowledge Engine** | `NotebookKnowledgeBuilder` → `knowledge_files` + cache | Default context path |
| **NotebookLM** | Optional research + Playwright grounding | Direct file/text upload only |
| **Gemini** | Web API (FAT from SQLite) or Playwright-in-Notebook | Unchanged |
| **Google Drive** | OAuth + Docs upload + DRIVE_LIVE bindings | **Removed** |

**Key finding:** Translation **does not hard-block on Drive OAuth**. `prepareForTranslate` catches Drive sync failures and continues with local fat-pack. Drive is architecturally central to the **DRIVE_LIVE → version probe → SLIM pack** optimization loop, not to basic SQLite → Gemini translation.

**Package dependency:** `googleapis@^144.0.0` — used exclusively by the Drive layer.

**Renderer note:** Drive IPC (`window.khepreeNovelAI.drive.*`) is wired in preload/handlers, but almost no renderer page calls it directly except **Settings** (OAuth client ID). Knowledge sync is routed through **`notebook.syncNow`** on AiMemoryPage.

---

## Classification Legend

| Class | Meaning |
|-------|---------|
| **A — REMOVE COMPLETELY** | Safe to delete once Drive transport is retired; no runtime replacement needed |
| **B — REPLACE WITH LOCAL** | Logic stays; Drive call replaced by local-only path (fallback often exists) |
| **C — NOTEBOOKLM DIRECT FILE UPLOAD** | Replace Drive transport with local file / copied-text attach to NotebookLM |
| **D — LEGACY MIGRATION ONLY** | Keep for one-time migration of existing projects; not part of new architecture |
| **E — KEEP TEMPORARILY FOR COMPATIBILITY** | Core to current Notebook DRIVE_LIVE loop; remove only after new sync architecture ships |

---

## Target Architecture (Drive must not remain in core)

```
┌─────────────────────────────────────────────────────────────┐
│  SQLite / Local Files          SOURCE OF TRUTH              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Local Knowledge Engine        DEFAULT CONTEXT              │
│  NotebookKnowledgeBuilder → knowledge_files + local cache   │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│  NotebookLM (optional)    │   │  Gemini                 │
│  file/text upload       │   │  Web API or Playwright  │
│  research engine        │   │  translation engine     │
└─────────────────────────┘   └─────────────────────────┘

Google Drive: REMOVED (no OAuth, no googleapis, no drive_* runtime path)
```

---

## Critical Path — Current Production Flow

### Path A — Playwright + NotebookLM (Drive-centric optimization)

```
Source folder / import
  → SQLite (chapters, terms, memory, jobs)
  → NotebookKnowledgeBuilder (00–08 knowledge files)
  → DriveSyncService (Google Docs upload, drive_file_id)
  → NotebookLM DRIVE_LIVE sources (Playwright Drive picker)
  → Version probe (08_SYNC_STATE via browser)
  → Pack mode SLIM / HYBRID (token-efficient)
  → Gemini Playwright-in-Notebook
  → Parser / QA / Learning pipeline
  → Learning → NotebookSyncService.syncDrive → DriveSyncService (loop)
```

### Path B — Gemini Web API (Drive-free today)

```
Source → SQLite → NotebookKnowledgeBuilder → FAT pack from SQLite
  → Gemini Web API worker
  → Parser / QA / Learning (local rebuild; syncDrive fails soft)
```

`AiProviderManager` + `resolveTranslationPackMode` force **FAT** for `GEMINI_WEB_API` regardless of Drive state.

### Where translation BLOCKS if Drive is missing

| Stage | Hard block? | Condition | Without Drive |
|-------|-------------|-----------|---------------|
| `ensureForTranslate` | **No** (Drive-specific) | — | `prepareForTranslate` logs warn, sets `usedFallback: true`, continues |
| `ensureForTranslate` | **Yes** | No Google account | `no_account` |
| `ensureForTranslate` | **Yes** | Google login heal fails | `needs_google_login` |
| `ensureForTranslate` | **Yes** (Playwright path) | No Web API AND Notebook not ready | `needs_notebook` |
| Job execution (Web API) | **No** | Web API READY | Full translate from SQLite FAT pack |
| Job execution (Playwright) | **Partial** | Notebook mapping must be `ready`/`sync_pending`/`stale` | Works with STATIC_UPLOAD bindings; SLIM degraded |
| `GeminiService.sendTranslation` (Playwright) | **Yes** | Notebook not ready/sync_pending | Not Drive-specific; Notebook setup often used Drive during provision |
| Learning after PASS | **No** | Drive sync failure logged | Next chapter still works via FAT/HYBRID |
| SLIM pack mode | **Effective degradation** | Needs DRIVE_LIVE + version probe on `drive_sync_state` | Falls back to HYBRID/FAT — higher tokens, not hard stop |
| FULL preprocess quick path | **No** | Drive sync deferred with warning | Local knowledge still built |
| Grounding smoke B/D | **Yes** | Explicitly requires DRIVE_LIVE | Test-only |

**Bottom line:** Drive is **not** required to start translation when Gemini Web API is READY, or when Notebook was provisioned via static file/text fallback. Drive **is** required for the intended live-update NotebookLM loop and SLIM token optimization.

---

## Baseline Test Status (pre-removal, 2026-08-28)

| Command | Result | Details |
|---------|--------|---------|
| `npm run lint` | **FAIL** | Exit 1 — 211 problems (210 errors, 1 warning). Predominantly `@typescript-eslint/no-deprecated` (`displayNameNative`), tabular lint, unrelated to Drive. |
| `npm run typecheck` | **PASS** | Exit 0 |
| `npm test` | **PASS** | Exit 0 — 134 files passed, 1 skipped; 895 tests passed, 2 skipped |
| `npm run test:integration` | **PASS** | Exit 0 — 4 files, 23 tests passed |

Artifacts: `gate-lint-phase1.txt`, `typecheck-phase1.txt`, `unit-test-phase1.txt`, `integration-test-phase1.txt`

---

## Audit Table — Production Code

### A. Core Drive Layer (main process)

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| DriveSyncService | `src/main/drive/drive-sync-service.ts` | OAuth, folder tree, Google Docs CRUD, `drive_file_id`, DRIVE_LIVE bindings, provision/sync/retry | Official transport SQLite knowledge → Google Drive for NotebookLM live sources | E | Local knowledge export + direct Notebook file attach | Critical | Feature-flag; plan deprecation |
| DriveOAuthService | `src/main/drive/drive-oauth-service.ts` | Desktop OAuth, `drive.file` scope, encrypted tokens, redirect `127.0.0.1:18766` | Authenticate Drive API per worker | A | None | Low | Delete with Drive layer |
| GoogleDriveApiClient | `src/main/drive/google-drive-api-client.ts` | `googleapis` Drive v3 — create/update Docs, folders | Low-level Drive API | A | None | Critical if removed prematurely | Delete when transport replaced |
| DriveClient | `src/main/drive/drive-client.ts` | Interface over Drive API | Abstraction / test seam | B | Local file writer interface | Low | Retire with DriveSyncService |
| MockDriveClient | `src/main/drive/mock-drive-client.ts` | In-memory Drive mock | Unit tests | B | Mock local writer | Low | Retire with Drive tests |
| drive-content-builder | `src/main/drive/drive-content-builder.ts` | Maps knowledge keys → Doc titles; writes local cache | Shared between Drive upload and local Notebook paths | C | Extract to `notebook/local-knowledge-writer.ts` | Medium | Split non-Drive parts first |
| DriveSyncService singleton | `src/main/services/drive-sync-service-singleton.ts` | Wires OAuth + sync; injects `setNotebookDriveSyncFn` | App bootstrap wiring | A | Remove injection; local sync fn | Medium | Delete after notebook decoupling |

### B. Database — Schema, Migrations, Repositories

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| `drive_resources` table | `src/main/db/migrations/001-initial-schema.ts` | Stores Drive resource metadata | Early Drive mapping | D | Keep rows; stop writing | Medium | Migration-only reads |
| `drive_connected` column | `src/main/db/migrations/004-google-accounts.ts` | Account Drive OAuth state | Worker readiness heuristic | A | Drop column after UI removal | Low | Schema migration phase 2+ |
| Drive sync migration | `src/main/db/migrations/007-drive-sync.ts` | `drive_sync_state`, `drive_resources` extensions | Sync schedule, worker assignment | D | Rename → `knowledge_sync_state` | High | Schema rename phase 2 |
| Notebook knowledge migration | `src/main/db/migrations/017-notebook-knowledge.ts` | `last_drive_sync_at` on notebooks | Sync timestamp tracking | B | Rename → `last_knowledge_sync_at` | Low | Column rename |
| Source bindings migration | `src/main/db/migrations/024-notebook-source-bindings.ts` | `DRIVE_LIVE` binding type | NotebookLM live source links | D | Migrate to `STATIC_UPLOAD` | High | One-time re-provision |
| Version probe migration | `src/main/db/migrations/025-knowledge-version-probe.ts` | Probe fields on `drive_sync_state` | Notebook version verification | B | Move to `knowledge_sync_state` | Medium | Decouple table name |
| DriveResourceRepository | `src/main/db/repositories/drive-resource-repository.ts` | CRUD for `drive_file_id` per knowledge type | Drive Doc mapping | D | Deprecate; local-only knowledge_files | High | Stop writes phase 2 |
| DriveSyncStateRepository | `src/main/db/repositories/drive-sync-state-repository.ts` | Worker assignment, sync policy, version probe | Project ↔ worker ↔ sync cadence | B | Rename repo + table; keep policy fields | High | Rename, not delete |
| NotebookSourceBindingRepository | `src/main/db/repositories/notebook-source-binding-repository.ts` | `DRIVE_LIVE` rows | Grounding mode tracking | D | Mark `needs_migration`; re-bind local | High | Migration script |
| KnowledgeFileRepository | `src/main/db/repositories/knowledge-file-repository.ts` | `drive_file_id`, `markDriveSynced` | Links knowledge to Drive Docs | B | Drop drive columns; local hash only | Medium | Schema cleanup |
| GoogleAccountRepository | `src/main/db/repositories/google-account-repository.ts` | `drive_connected` read/write | Account health | A | Remove Drive fields from READY heuristic | Low | Update DTO |
| DatabaseManager | `src/main/db/database-manager.ts` | Exposes drive repos | Wiring | B | Rename/remove drive repos | Medium | Incremental |

### C. Notebook / Knowledge Pipeline

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| NotebookSyncService.syncDrive | `src/main/notebook/notebook-sync-service.ts` | Delegates to DriveSyncService; `lastDriveSyncAt`; marks drive synced | Single sync entry from learning/bootstrap/UI | C | `syncLocalSources()` → optional Notebook attach | High | Rename + guard |
| NotebookSyncService singleton | `src/main/notebook/notebook-sync-service-singleton.ts` | `setNotebookDriveSyncFn` injection | Decouple notebook from direct Drive import | B | Inject local sync fn | Medium | Rewire bootstrap |
| NotebookBootstrapService.prepareForTranslate | `src/main/notebook/notebook-bootstrap-service.ts` | Best-effort `sync.syncDrive`; reads `driveSyncState` | Pre-translate knowledge refresh | B | Skip Drive when unconfigured | Low | Add `driveEnabled` guard |
| NotebookKnowledgeBuilder | `src/main/notebook/knowledge-builder.ts` | Imports `DRIVE_RESOURCE_KEYS` constant names | Builds 00–08 knowledge files | B | Rename constants to `KNOWLEDGE_RESOURCE_KEYS` | Low | Cosmetic rename |
| attachKnowledgeSources | `src/main/notebook/attach-knowledge-sources.ts` | Drive LIVE first (`preferDriveLive: true` default) | Provision Translation Notebook | C | Default `preferDriveLive: false`; file/text first | High | Flip default |
| notebook-version-probe | `src/main/notebook/notebook-version-probe.ts` | Reads `08_SYNC_STATE` from Drive via browser | Proves Notebook ingested latest knowledge | D | Local nonce file or drop probe | High | Optional for Notebook-off |
| hot-memory-builder | `src/main/notebook/hot-memory-builder.ts` | Reads `drive_sync_state.version_probe_status` | Clears hot deltas when verified | B | Read from renamed sync state table | Medium | Table rename |
| notebook-source-presence | `src/main/notebook/notebook-source-presence.ts` | Drive vs static duplicate detection | Migration hygiene | C | Static-only presence checks | Low | Simplify |
| NotebookService | `src/main/services/notebook-service.ts` | `drive-content-builder`, `preferDriveLive: true`, `driveFileId` in DTOs | Provision/resume Translation Notebook | C | Local file attach only | High | Rewire provision |
| Learning pipeline | `src/main/learning/learning-pipeline.ts` | Calls `NotebookSyncService.syncDrive` every N chapters | Propagate memory deltas to Notebook | B | Local rebuild; optional Notebook push | Medium | Already fails soft |
| LearningService | `src/main/services/learning-service.ts` | `drive_sync` event type; `driveSyncState.ensure` | Sync policy bookkeeping | B | Rename event; use knowledge sync state | Low | Rename |
| pack-mode-resolver | `src/main/prompt/pack-mode-resolver.ts` | SLIM needs DRIVE_LIVE + version probe | Token-efficient Playwright packs | B | SLIM from STATIC_UPLOAD verify or drop SLIM | Medium | FAT/HYBRID already work |
| FULL preprocess orchestrator | `src/main/bootstrap/full-novel-preprocess-orchestrator.ts` | Indirect sync path | Post-import knowledge push | B | Local rebuild + optional Notebook | Medium | Guard Drive calls |
| FULL preprocess service | `src/main/bootstrap/full-novel-preprocess-service.ts` | `syncDrive` in flow | Knowledge refresh after preprocess | B | Skip when Drive disabled | Medium | Guard |
| FULL preprocess auto | `src/main/bootstrap/full-novel-preprocess-auto-service.ts` | `syncDrive` option | Auto preprocess pipeline | B | `syncLocal: true` default | Medium | Guard |

### D. IPC, Preload, Shared Contracts

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| Drive IPC channels | `src/shared/constants/ipc-channels.ts` | 8 channels: oauthStatus, setOAuthClient, getStatus, assignWorker, setSchedule, provision, sync, retry | Backend Drive API surface | A | Remove channels | Medium | Stub no-op first |
| Account Drive channels | `src/shared/constants/ipc-channels.ts` | connectDrive, connectDriveAuth, disconnectDrive | Per-account OAuth | A | Remove | Low | Remove with UI |
| IPC handlers (Drive) | `src/main/ipc/register-handlers.ts` | Handlers for all drive:* + account Drive + notebook:syncNow → syncDrive | Renderer/main bridge | C | Rewire syncNow to local sync | Medium | Incremental |
| IPC audit | `src/main/security/ipc-audit.ts` | Drive channel allowlist | Security | A | Remove Drive entries | Low | Cleanup |
| preload Drive API | `src/preload/preload.ts` | `window.khepreeNovelAI.drive.*`, account connectDrive | Renderer exposure | A | Remove | Low | With UI |
| IPC types | `src/shared/types/ipc.ts` | DriveSyncStatusDto, connectDrive signatures | Type contracts | A | Remove | Low | Cleanup |
| drive schemas | `src/shared/schemas/drive.ts` | Zod schemas for Drive DTOs | Validation | A | Delete | Low | Phase 2 |
| drive constants | `src/shared/constants/drive.ts` | Resource keys, OAuth meta keys | Shared naming | B | Rename to knowledge constants | Low | Rename |
| notebook-source-binding constants | `src/shared/constants/notebook-source-binding.ts` | `DRIVE_LIVE` enum | Binding types | D | Deprecate enum value | Medium | Keep for migration reads |
| translation-context constants | `src/shared/constants/translation-context.ts` | `DRIVE_LIVE` knowledge source mode | Job diagnostics | B | Add `LOCAL_ONLY` default | Low | Rename modes |
| setup constants | `src/shared/constants/setup.ts` | `SETUP_SKIP_DRIVE`, `skippedDrive` meta | Legacy wizard | A | Already mapped to googleAccount | Low | Delete meta keys |
| guides constants | `src/shared/constants/guides.ts` | `drive-oauth-setup` guide id | Settings help link | A | Remove guide | Low | Delete |
| account schema | `src/shared/schemas/account.ts` | `driveConnected` field | Account DTO | A | Remove field | Low | Phase 2 |
| notebook schema | `src/shared/schemas/notebook.ts` | `lastDriveSyncAt`, drive fields | Notebook DTO | B | Rename fields | Low | Rename |
| diagnostics schema | `src/shared/schemas/diagnostics.ts` | `drive` test kind | Health checks | A | Remove kind | Low | Delete |
| job schema | `src/shared/schemas/job.ts` | `DRIVE_LIVE` in knowledgeSourceMode | Progress diagnostics | B | `LOCAL_ONLY` / `STATIC_UPLOAD` | Low | Extend enum |
| knowledge constants | `src/shared/constants/knowledge.ts` | Drive-related sync event names | Telemetry | B | Rename events | Low | Rename |
| learning constants | `src/shared/constants/learning.ts` | Drive sync policy references | Learning config | B | knowledge sync naming | Low | Rename |
| project-worker constants | `src/shared/constants/project-worker.ts` | Drive assignment comment | Worker resolution docs | B | Notebook worker naming | Low | Docs |

### E. Services, Workers, Translation Path

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| AccountWorkerService | `src/main/services/account-worker-service.ts` | connectDrive/disconnectDrive, DRIVE_URL, drive in READY heuristic | OAuth UX + worker health | A | Gemini session only for READY | Low | Remove Drive methods |
| ProjectWorkerResolver | `src/main/services/project-worker-resolver.ts` | Priority: Drive-assigned worker; `assignWorker` writes drive_sync_state | Bind project → Google worker | B | Project pin without Drive table | Medium | Split notebook worker |
| TranslateReadinessService | `src/main/services/translate-readiness-service.ts` | Indirect via prepareForTranslate; **no Drive OAuth check** | Pre-translate gate | B | No change needed for Drive removal | Low | Verify only |
| DiagnosticsService | `src/main/services/diagnostics-service.ts` | `testDrive`, grounding smoke Drive client | Ops health | A | Remove Drive diagnostic | Low | Delete testDrive |
| SetupService | `src/main/services/setup-service.ts` | `skippedDrive` meta, setSkipDrive | Legacy wizard | A | Remove legacy keys | Low | Cleanup |
| JobService | `src/main/services/job-service.ts` | Reports `DRIVE_LIVE` knowledgeSourceMode | Job progress | B | Default LOCAL | Low | Update reporting |
| translation-context-diagnostics | `src/main/jobs/translation-context-diagnostics.ts` | Returns DRIVE_LIVE when bindings active | Job diagnostics | B | Prefer STATIC_UPLOAD / LOCAL | Low | Update logic |
| AiProviderManager | `src/main/ai/ai-provider-manager.ts` | Web API → FAT from SQLite (Drive-free) | Provider routing | B | Already Drive-free for Web API | Low | Promote Web API |
| app-bootstrap | `src/main/app-bootstrap.ts` | `initializeDriveSyncService()` | Startup wiring | A | Remove init | Medium | Phase 2 |
| account-dto | `src/main/services/account-dto.ts` | `driveConnected` mapping | UI display | A | Remove | Low | With UI |

### F. Playwright / Notebook Automation

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| NotebookProvider.addDriveSources | `src/main/automation/providers/google/notebook-provider.ts` | Playwright Drive picker automation | DRIVE_LIVE provision | C | File upload / copied text only | High | Keep as optional |
| google-notebook.selectors | `src/main/automation/providers/google/selectors/google-notebook.selectors.ts` | Drive source picker selectors | UI automation | C | Deprioritize; keep for legacy | Medium | Optional path |
| generation-lifecycle | `src/main/automation/providers/google/generation-lifecycle.ts` | Drive-related lifecycle hooks | Notebook session | B | Reduce Drive branches | Low | Simplify |
| browser-session-controller | `src/main/automation/browser-runner/browser-session-controller.ts` | Drive URL navigation option | Open Drive for OAuth | A | Remove drive target | Low | Keep gemini/notebook |
| browser-engine-resolver | `src/main/automation/browser-runner/browser-engine-resolver.ts` | Drive context mention | Browser profiles | B | Notebook-only profiles | Low | Cleanup |
| grounding-smoke-runner | `src/main/notebook-grounding-smoke/grounding-smoke-runner.ts` | DRIVE_LIVE scenarios B/D | QA validation | A (prod) | Local-only smoke scenarios | Low | Keep for optional QA |
| grounding-smoke-config | `src/main/notebook-grounding-smoke/grounding-smoke-config.ts` | Drive file ID config | Smoke setup | A | Local config | Low | Update smoke |
| grounding-smoke-report | `src/main/notebook-grounding-smoke/grounding-smoke-report.ts` | Drive availability reporting | Smoke output | A | Local report | Low | Update |
| google-smoke.config.example.json | `google-smoke.config.example.json` | Drive file IDs in example | Dev config | A | Remove Drive fields | Low | Update example |

### G. Renderer UI & i18n

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| SettingsPage | `src/renderer/pages/SettingsPage.tsx` | Drive OAuth client ID, guide link, `window.khepreeNovelAI.drive.*` | Pre-req for Connect Drive | A | Remove Drive section | Low | Phase 2 UI |
| AccountsPage | `src/renderer/pages/AccountsPage.tsx` | Connect/disconnect Drive, OAuth fallback UI, badge | Per-worker Drive auth | A | Remove; keep Gemini/Notebook | Low | Phase 2 UI |
| AiMemoryPage | `src/renderer/pages/AiMemoryPage.tsx` | `syncNow` → Drive; `lastDriveSyncAt` display | Operator knowledge sync | C | "Push to Notebook (local files)" | Medium | Relabel + rewire |
| DiagnosticsPage | `src/renderer/pages/DiagnosticsPage.tsx` | Drive health test display | Ops | A | Remove Drive test | Low | Phase 2 |
| TranslationEditorPage | `src/renderer/pages/TranslationEditorPage.tsx` | Indirect via ensure-translate-ready | Pre-flight | B | No Drive-specific change | Low | Verify |
| ensure-translate-ready | `src/renderer/utils/ensure-translate-ready.ts` | Calls translate:ensureReady (no Drive check) | Editor gate | B | Already Drive-agnostic | Low | None |
| AiStatusPanel | `src/renderer/components/translation/AiStatusPanel.tsx` | May show sync state | Status display | B | Local sync labels | Low | Copy update |
| HelpChecklist | `src/renderer/features/help/components/HelpChecklist.tsx` | "Drive connected" checklist item | Onboarding | A | Local-first checklist | Low | Update |
| Help: accounts | `src/renderer/features/help/content/accounts.ts` | google-drive article | User docs | A | Rewrite local-first | Low | Docs |
| Help: translation | `src/renderer/features/help/content/translation.ts` | Drive in relatedIds/keywords | Cross-link | A | Remove Drive refs | Low | Docs |
| Help: intro/book-metadata/terms/troubleshooting | respective files | Drive mentions | User guidance | A | Update copy | Low | Docs |
| i18n en/vi | `src/renderer/i18n/en.ts`, `vi.ts` | ~35 Drive strings each | OAuth/Drive UI | A | Remove or archive | Low | With UI |
| global.css | `src/renderer/styles/global.css` | `.drive-oauth-fallback` | OAuth fallback styling | A | Remove class | Low | With AccountsPage |

### H. Indirect Dependencies (requested scope)

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| Notebook provision | `src/main/services/notebook-service.ts` | Drive-first attach during provision/resume | Seed Translation Notebook | C | Local file attach | High | Rewire |
| Notebook sync | `src/main/notebook/notebook-sync-service.ts` | syncDrive naming + Drive delegation | Post-learning sync | C | Local sync + optional push | High | Rename |
| Knowledge files | `knowledge-builder.ts`, repos | `drive_file_id` column | Drive Doc linkage | B | Local hash/version only | Medium | Schema |
| Bootstrap | `notebook-bootstrap-service.ts` | syncDrive in prepareForTranslate | Pre-translate | B | Skip Drive step | Low | Guard |
| FULL preprocessing | `full-novel-preprocess-*.ts` | syncDrive calls | Post-import push | B | Local only | Medium | Guard |
| Translation readiness | `translate-readiness-service.ts` | No direct Drive check | Gate translate | B | Unchanged | Low | Verify |
| Project creation | project IPC/handlers | No direct Drive on create | — | — | — | Low | None found |
| Google account readiness | `account-worker-service.ts` | `drive_connected` in READY | Worker status | A | Email/session based READY | Low | Update heuristic |
| Translation Editor preflight | `ensure-translate-ready.ts` | Uses ensureReady IPC | Pre-translate | B | Already tolerant | Low | None |
| AiMemoryPage | see G | syncNow → Drive | UI sync control | C | Local push | Medium | Rewire |
| Scheduler | `src/main/jobs/scheduler*.ts` | **No Drive references** | Job scheduling | — | — | Low | None |
| Help Center | help content files | Drive onboarding copy | UX | A | Local-first docs | Low | Update |
| Settings | SettingsPage | OAuth client config | Drive setup | A | Remove section | Low | Phase 2 |
| Backup | `src/main/db/backup.ts`, portability | **No Drive references** | SQLite backup | — | — | Low | None |
| Portability | `src/main/portability/*` | **No Drive references** | Export/import archives | — | — | Low | None |

---

## Audit Table — Tests

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| drive-sync tests | `tests/unit/drive/drive-sync.test.ts` | Full DriveSyncService coverage | Unit tests | A | Delete with Drive code | Low | Phase 2 |
| drive-oauth-parse | `tests/unit/drive/drive-oauth-parse.test.ts` | OAuth URL parsing | Unit tests | A | Delete | Low | Phase 2 |
| learning-drive-boundary | `tests/unit/learning/learning-drive-boundary.test.ts` | Asserts learning never calls Drive API directly | Architecture guard | B | Rename to knowledge-sync boundary | Low | Update |
| drive-live-knowledge | `tests/unit/notebook/drive-live-knowledge.test.ts` | DRIVE_LIVE attach flow | Unit tests | C | STATIC_UPLOAD tests | Medium | Rewrite |
| attach-knowledge-sources | `tests/unit/notebook/attach-knowledge-sources.test.ts` | Drive fallback to STATIC | Priority tests | C | File-first default tests | Medium | Flip defaults |
| prepare-for-translate | `tests/unit/notebook/prepare-for-translate.test.ts` | syncDrive in prepare | Bootstrap tests | B | Local-only prepare | Low | Update |
| knowledge-architecture | `tests/unit/notebook/knowledge-architecture.test.ts` | Drive in architecture assertions | Design tests | B | Local architecture | Low | Update |
| knowledge-version-probe | `tests/unit/notebook/knowledge-version-probe.test.ts` | Drive sync state probe | Version tests | B | Renamed sync state | Medium | Update |
| hot-memory | `tests/unit/notebook/hot-memory.test.ts` | drive_sync_state probe | Hot delta tests | B | knowledge_sync_state | Low | Rename |
| notebook-provider | `tests/unit/notebook/notebook-provider.test.ts` | addDriveSources | Playwright tests | C | File attach tests | Medium | Extend |
| notebook-sync-lifecycle | `tests/unit/learning/notebook-sync-lifecycle.test.ts` | syncDrive lifecycle | Integration unit | C | Local sync lifecycle | Medium | Rewrite |
| learning-pipeline | `tests/unit/learning/learning-pipeline.test.ts` | syncDrive injection | Pipeline tests | B | Local sync mock | Low | Update |
| rebuild-knowledge-every-pass | `tests/unit/learning/rebuild-knowledge-every-pass.test.ts` | syncDrive after rebuild | Policy tests | B | Optional sync | Low | Update |
| translate-readiness | `tests/unit/services/translate-readiness.test.ts` | prepareForTranslate mock | Readiness tests | B | Unchanged | Low | Verify |
| project-worker-resolver | `tests/unit/services/project-worker-resolver.test.ts` | Drive assignment priority | Worker tests | B | Pin without Drive | Medium | Update |
| pack-mode-transitions | `tests/unit/prompt/pack-mode-transitions.test.ts` | DRIVE_LIVE SLIM paths | Pack mode tests | B | STATIC SLIM or FAT | Medium | Update |
| translation-context-diagnostics | `tests/unit/jobs/translation-context-diagnostics.test.ts` | DRIVE_LIVE mode | Diagnostic tests | B | LOCAL mode | Low | Update |
| notebook-grounding-e2e | `tests/integration/notebook-grounding-e2e.test.ts` | syncDrive in E2E | Integration | C | Local grounding E2E | High | Rewrite scenarios |
| setup-updates | `tests/unit/release/setup-updates.test.ts` | skippedDrive meta | Setup tests | A | Remove Drive skip | Low | Update |
| heal-workers | `tests/unit/jobs/heal-workers.test.ts` | Minor drive_connected | Worker heal | B | Update fixture | Low | Update |
| paths-service | `tests/unit/paths-service.test.ts` | Drive path comment | Paths | A | Remove comment | Low | Trivial |
| language-profile | `tests/unit/language/language-profile.test.ts` | Incidental drive string | Unrelated | — | — | Low | None |
| notebook-open fixture | `tests/fixtures/notebook/notebook-open.html` | Drive picker DOM | Playwright fixture | C | File upload fixture | Low | Update |

---

## Audit Table — Docs & Resources

| Component | File | Current Drive Dependency | Why It Exists | Can Remove | Replacement | Risk | Action |
|-----------|------|--------------------------|---------------|------------|-------------|------|--------|
| DRIVE.md | `docs/DRIVE.md` | Full Drive architecture doc | Operator reference | A | Archive or replace with LOCAL_KNOWLEDGE.md | Low | Rewrite |
| NOTEBOOK_ARCHITECTURE.md | `docs/NOTEBOOK_ARCHITECTURE.md` | Drive in flow diagrams | Architecture | A | SQLite → local files → Notebook | Low | Rewrite |
| NOTEBOOK.md | `docs/NOTEBOOK.md` | Drive sync steps | User guide | A | Local attach guide | Low | Rewrite |
| ARCHITECTURE.md | `docs/ARCHITECTURE.md` | Drive layer references | Overview | A | Remove Drive layer | Low | Update |
| LEARNING.md | `docs/LEARNING.md` | Drive sync after learning | Pipeline docs | B | Local sync docs | Low | Update |
| DATABASE.md | `docs/DATABASE.md` | drive_* tables | Schema docs | D | knowledge_sync_state docs | Low | Update |
| DIAGNOSTICS.md | `docs/DIAGNOSTICS.md` | Drive health test | Ops | A | Remove Drive section | Low | Update |
| USER_GUIDE.md, TROUBLESHOOTING.md, etc. | various | Drive setup steps | User docs | A | Local-first guides | Low | Bulk update |
| drive-oauth-setup.html | `resources/guides/drive-oauth-setup.html` | OAuth setup wizard | Settings guide | A | Delete | Low | Delete |
| CHANGELOG.md | `CHANGELOG.md` | Historical Drive entries | Changelog | — | — | Low | Note removal in future |

---

## Package & External Dependencies

| Dependency | Location | Drive-specific? | Action |
|------------|----------|-----------------|--------|
| `googleapis@^144.0.0` | `package.json` | **Yes** — only used by `google-drive-api-client.ts` | Remove after Drive code deleted |
| `playwright@1.62.1` | `package.json` | No — Gemini + NotebookLM automation | **Keep** |
| Google Account OAuth (browser) | `account-worker-service.ts` | No — Gemini/Notebook login | **Keep** |

---

## Recommended Removal Sequence (Phase 2+)

1. **Feature flag** `KNOWLEDGE_TRANSPORT=local|drive` (default `local` for new installs).
2. **Guard all `syncDrive()`** — skip when flag off; `prepareForTranslate` already tolerant.
3. **Flip Notebook attach default** — `preferDriveLive: false` globally.
4. **Rewire AiMemory "Sync now"** — local rebuild + optional Notebook file push.
5. **Remove Drive UI** — Settings OAuth, Accounts connect/disconnect, Help checklist item.
6. **Schema migration** — `drive_sync_state` → `knowledge_sync_state`; deprecate `drive_file_id`.
7. **Remove IPC channels** — drive:*, account connectDrive/disconnectDrive.
8. **Delete Drive layer** — `src/main/drive/*`, singleton, `googleapis` dep.
9. **Update tests & docs** — flip attach defaults, rewrite E2E, archive DRIVE.md.

---

## What Must NOT Be Deleted Blindly

- `NotebookKnowledgeBuilder` — core local engine (only naming ties to Drive constants).
- `knowledge_files`, `notebook_hot_deltas`, learning pipeline — SQLite memory loop.
- Playwright Notebook automation — still useful via file upload in `attach-knowledge-sources.ts`.
- Google Account management — required for Gemini and NotebookLM browser sessions.
- FULL-novel preprocessing orchestration — only Drive *sync calls* need guarding, not the pipeline itself.

---

## File Count Summary

| Category | Files with Drive touchpoints |
|----------|------------------------------|
| Core Drive layer (`src/main/drive/`) | 7 |
| DB migrations + repos | 12 |
| Notebook / knowledge pipeline | 15 |
| IPC / preload / shared schemas | 18 |
| Services / jobs / bootstrap | 14 |
| Playwright / smoke | 8 |
| Renderer UI + i18n + help | 16 |
| Unit tests | 18 |
| Integration tests | 1 |
| Docs + resources | 16+ |
| **Total (unique)** | **~110** |

---

## Phase 1 Completion Checklist

- [x] Full codebase audit for Drive dependencies (direct + indirect)
- [x] Classification table (A–E) with replacement and risk
- [x] Critical path documented with block points
- [x] Target architecture confirmed (Drive not in core)
- [x] Baseline tests run with honest pass/fail recording
- [x] No production code deleted in this phase

**Next phase:** Implement feature flag + guard sync paths before deleting Drive layer.
