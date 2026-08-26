# NovelTrans Studio — Project State

> Last updated: 2026-08-24

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

## In Progress

- [ ] Nothing active

## Not Started

### Follow-ups — Bundle Python runtime; Official Gemini API provider; lease renewal during long AI calls

### Notebook Knowledge Architecture (2026-08-25)
- [x] Migration **017** — knowledge_files, hot deltas, notebook versions, world_knowledge_json
- [x] NotebookKnowledgeBuilder 00–07; NotebookSyncService; slim/fat TranslationPack
- [x] Playwright-in-Notebook preferred; Web API fat-pack fallback; thread rotation
- [x] Bootstrap seed; Bộ nhớ AI UI; docs/NOTEBOOK_ARCHITECTURE.md

## Next Recommended Step

**Do not ship.** See [FINAL_RELEASE_AUDIT.md](./FINAL_RELEASE_AUDIT.md) — verdict **NOT READY**.

Priority order:
1. Lease renewal during Gemini/repair
2. Startup crash-attempt + gemini_request recovery
3. Sanitize auto DB backups; constrain import paths; restore UI
4. Embedded Python for Web API worker (optional)