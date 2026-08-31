# NovelTrans Studio — Project State

> Last updated: 2026-08-29

## Status legend

| Label | Meaning |
|-------|---------|
| **IMPLEMENTED** | Code merged; unit/integration tests may pass |
| **REAL TEST PASSED** | Live browser, manual QA, or opt-in smoke suite verified |
| **NOT IMPLEMENTED** | Not built yet |

Do **not** mark browser providers production-ready without **REAL TEST PASSED** live smoke for that provider.

---

## Completed

### Phase 0–15
- [x] Scaffold through Automation Scheduler

### Phase 16 — Learning Pipeline
- [x] TERM_DELTA → candidates only; merge duplicates; occurrences + counts
- [x] MEMORY_DELTA apply / conflict queue
- [x] Confidence: occurrence / human / project — never AI→GLOBAL_VERIFIED
- [x] Compact + archive historical memory
- [x] Every N chapters: consolidate markdown + Drive sync
- [x] Learning Dashboard UI
- [x] Migration **012**
- [x] `docs/LEARNING.md`

### Phase 17 — Translation Editor UI
- [x] Split editor, human lock, version history, virtualized list
- [x] Migration **013**; `docs/EDITOR.md`

### Phase 18 — Data Portability
- [x] Novel export TXT / DOCX / EPUB
- [x] Full / project backup + restore validation
- [x] Auto local DB backups
- [x] Term import preview; IPC portability; `/export` UI; `docs/PORTABILITY.md`

### Phase 19 — Automation Diagnostics
- [x] Provider diagnostics, selector override, repair mode, export ZIP
- [x] `docs/DIAGNOSTICS.md`

### Final — Windows Production Release
- [x] Electron Forge Squirrel; AppData persistence; first-run wizard
- [x] Crash handlers, ErrorBoundary, security guards
- [x] Perf tests + docs (README, USER_GUIDE, TROUBLESHOOTING, …)

### UI / UX Redesign (2026-08-24)
- [x] Design tokens (dark-first) + titlebar sync
- [x] UI primitives + lucide-react
- [x] App shell: sidebar / top bar / status bar (nav 1A)
- [x] Vietnamese i18n (`vi` default, `en` stub)
- [x] Redesigned core pages + Setup; `/editor` → `/translation`
- [x] Notification center + poll adapter
- [x] Logs dual-mode + `logs:tail` / `logs:openDir` IPC
- [x] Friendly errors + Dialog confirms
- [x] `docs/UI_UX.md`

### Help Center (2026-08-24)
- [x] Sidebar **Hướng dẫn** (`/help`, `/help/:articleId`)
- [x] 30+ articles, local search, setup checklist (live state)
- [x] Context help (?), F1, ErrorPanel deep links
- [x] `docs/HELP_SYSTEM.md`

### Book metadata & source classification (2026-08-24)
- [x] Migration **015** — project metadata, `project_documents`, `chapter_type` / `sequence_order`
- [x] `_BOOK_INFO.txt` parser, source file classifier, folder scanner integration
- [x] Book Profile builder + `00_BOOK_PROFILE.md` Drive sync
- [x] Create Project Wizard metadata preview; `/projects/:id/info`; `/projects/:id/source`
- [x] Help articles: `book-metadata-prep`, `book-info-file`, `prologue-preface`, `project-info`, `source-file-types`, `book-profile`
- [x] `docs/BOOK_METADATA.md`, `docs/SOURCE_FOLDER.md` updates

### AI Provider Manager + Gemini Web API (2026-08-24)
- [x] Migration **016** — `ai_providers`, `ai_accounts`, `ai_models`
- [x] `IAIProvider` + `AiProviderManager` + Playwright adapter
- [x] Python `workers/gemini_webapi_worker` (FastAPI localhost)
- [x] Wire production `sendInitial` / `sendRepair` through manager
- [x] Settings → Nhà cung cấp AI; help `ai-providers`
- [x] `docs/AI_PROVIDER.md`, `docs/GEMINI_WEB_API_PROVIDER.md`

### Notebook Knowledge Architecture (2026-08-25)
- [x] Migration **017** — knowledge_files, hot deltas, notebook versions, world_knowledge_json
- [x] NotebookKnowledgeBuilder 00–07; NotebookSyncService; slim/fat TranslationPack
- [x] Playwright-in-Notebook preferred; Web API fat-pack fallback; thread rotation
- [x] Bootstrap seed; Bộ nhớ AI UI; docs/NOTEBOOK_ARCHITECTURE.md

### Playwright Browser Engine (2026-08-26)
- [x] Playwright **1.62.1** (from `^1.49.1`)
- [x] `BrowserEngineResolver` — AUTO / EDGE / CHROME / PLAYWRIGHT_CHROMIUM
- [x] Windows AUTO: Edge → Chrome → bundled Chromium; dedicated NovelTrans profiles only
- [x] Remove default `--disable-blink-features=AutomationControlled` (opt-in advanced)
- [x] Headed default for Gemini/Notebook/`BrowserSession`
- [x] Engine/version in `engine-info.json` + failure diagnostics
- [x] Baseline audit `docs/PLAYWRIGHT_AUDIT_BEFORE_FIX.md`; breaking notes `docs/PLAYWRIGHT_1_62_BREAKING_CHANGES.md`
- [x] `docs/AUTOMATION.md` updated

### Default target language (2026-08-28)
- [x] `app_meta` key `settings.default_target_language`; IPC get/set
- [x] Settings → Dịch thuật → Ngôn ngữ dịch mặc định
- [x] Create Project wizard + Edition add pre-fill; duplicate edition warning
- [x] Onboarding `defaultLanguage` step; help `default-target-language`
- [x] `docs/LANGUAGE_CATALOG.md`, `docs/UI_UX.md` updates

### Source language: script vs language (2026-08-28)
- [x] Local script detection (Cyrl/Arab/Latn/Hebr) no longer high-confidence ru/ar/en
- [x] High local confidence only with language-specific evidence; unique scripts ja/ko/th allowed
- [x] Ambiguous script families call AI; AI codes validated against LanguageProfile catalog
- [x] `docs/LANGUAGE_CATALOG.md` + help `source-language-detection`

### Phase 7 — Local Learning Loop (2026-08-28)
- [x] Migration **038** — `jobs.knowledge_version_at_start`, `jobs.knowledge_version_at_commit`
- [x] `knowledge-version.ts` — monotonic local version bump after every PASS
- [x] Learning pipeline local-only default — no Drive/Notebook sync on PASS
- [x] Wave/repair jobs stamp knowledge snapshot for pack consistency
- [x] Test: Ch100→Ch101 inter-chapter learning + restart persistence

### Phase 8 — Local Backup & Portability (2026-08-28)
- [x] Atomic backup via SQLite `VACUUM INTO`
- [x] Daily auto-backup ZIP + tiered retention (7 daily / 4 weekly / 3 monthly)
- [x] Custom backup directory IPC + Portability UI
- [x] Rich restore preview; project export includes editions + memory events
- [x] `docs/PORTABILITY.md` updates

### Phase 9 — Drive Removal Cleanup (2026-08-28)
- [x] Removed Drive services, IPC, UI, schemas, tests, `googleapis` dependency
- [x] Kept legacy DB migrations + `drive_resources` reader for old databases
- [x] Search guard: no `DriveSyncService`, `syncDrive`, `DRIVE_LIVE` in active code paths
- [x] Docs rewrite: ARCHITECTURE, DATABASE, NOTEBOOK_ARCHITECTURE, HELP_SYSTEM, PROJECT_STATE
- [x] Deleted obsolete `docs/DRIVE.md`; audit in `docs/DRIVE_REMOVAL_AUDIT.md`

### Multi-Provider Browser AI — ChatGPT & Meta AI (2026-08-29) — **IMPLEMENTED**

- [x] `PLAYWRIGHT_CHATGPT` / `PLAYWRIGHT_META_AI` provider types + adapters
- [x] `PlaywrightBrowserAiService` — headed login, session verify, send via `browser-runtime-manager`
- [x] `AiProviderManager.sendForJob` routes all providers through same `TranslationPack` pipeline
- [x] `execution-worker-resolver` — ChatGPT/Meta schedulable with **zero Google accounts**
- [x] Capability-driven routing + batch sizing per transport
- [x] Migration / schema for `ai_accounts` browser profiles
- [x] `docs/AI_EXECUTION_WORKER_AUDIT.md`, `docs/CAPABILITY_DRIVEN_ROUTING.md`

**REAL TEST PASSED:** mock integration only (`tests/integration/multi-provider-acceptance.test.ts` — 19/19).  
**NOT REAL TEST PASSED:** live browser smoke per provider (`scripts/browser-conversation-smoke.ts` — NOT_RUN).

### Multi-Provider UX (Phase 6, 2026-08-29) — **IMPLEMENTED**

- [x] Provider-aware job UI (strip, drawer, running card, dashboard banner)
- [x] Setup wizard multi-provider picker (Gemini / ChatGPT / Meta AI)
- [x] Onboarding "Kết nối AI" — not Google-only
- [x] `docs/MULTI_PROVIDER_UX_AUDIT.md`

### Multi-Provider Acceptance Matrix (Phase 7, 2026-08-29)

| Layer | Status |
|-------|--------|
| Mock full pipeline (Gemini + ChatGPT + Meta) | **REAL TEST PASSED** (integration) |
| Zero-Google ChatGPT / Meta jobs | **REAL TEST PASSED** (integration) |
| Live browser login + send per provider | **NOT REAL TEST PASSED** |
| `docs/MULTI_PROVIDER_ACCEPTANCE.md` | Written — verdict **READY FOR EXTENDED TEST** |

### Browser Compatibility — Remove Stealth Dependency (Phase 8, 2026-08-29) — **IMPLEMENTED**

- [x] Deleted `playwright-stealth.ts`; ChatGPT/Meta use standard Playwright
- [x] `BrowserCompatibilityPatch.GOOGLE_LOGIN_LAUNCH` scoped to Gemini Google login only
- [x] `docs/BROWSER_COMPATIBILITY_AUDIT.md`
- [x] Unit tests: `tests/unit/automation/browser-compatibility-patch.test.ts`

**REAL TEST PASSED:** unit/architecture tests only. Live login persistence across restart — manual.

### Documentation Reconciliation (Phase 9, 2026-08-29) — **IMPLEMENTED**

- [x] README, PROJECT_STATE, ARCHITECTURE aligned to actual multi-provider architecture
- [x] IMPLEMENTED vs REAL TEST PASSED separation
- [x] Commercial licensing documented as NOT IMPLEMENTED
- [x] Release blockers explicit in PROJECT_STATE + RELEASE_CHECKLIST

## In Progress

- [ ] Playwright send-path hardening (selectors / confirm-sent / wait strategy) — **not started**; engine layer only
- [ ] Live browser smoke — ChatGPT, Meta AI, Gemini (**REAL TEST PASSED** gate for release)

## Not Started

### Follow-ups — Bundle Python runtime; Official Gemini API provider; lease renewal during long AI calls; commercial licensing; billing; website

## Next Recommended Step

**Do not ship.** See [FINAL_RELEASE_AUDIT.md](./FINAL_RELEASE_AUDIT.md) — verdict **NOT READY** (historical audit; blockers below still apply).

### Release blockers (explicit)

| Blocker | Status | Notes |
|---------|--------|-------|
| Real provider E2E (live browser send) | **OPEN** | Mock PASS only; smoke NOT_RUN |
| Send confirmation reliability | **OPEN** | Harness unit PASS; live unverified |
| Response anchoring / correlation extract | **OPEN** | Partial; provider DOM drift risk |
| Crash recovery (ChatGPT/Meta `ai_requests`) | **OPEN** | Gemini planner only today |
| Code signing / auto-update production server | **OPEN** | Optional signing; placeholder update provider |
| Commercial licensing enforcement | **NOT IMPLEMENTED** | UNLICENSED; no in-app license checks |

Priority order:
1. Live browser smoke per provider (login → send → verify → restart)
2. Playwright send-path hardening (confirm sent, reduce `waitForTimeout`, correlation extract)
3. Browser AI crash recovery planner for ChatGPT/Meta
4. Lease renewal during long AI calls
5. Code signing + production update channel (when product ready)
6. Commercial licensing (later — separate from core translation)

