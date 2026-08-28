# Production Wiring Audit

**Date:** 2026-08-27  
**Priority:** P0 — NEW impl exists, OLD impl must not keep running in production  
**Method:** Static call-graph + source scan (not doc claims)

## Summary

Listed contradictions **1–7** already wired to canonical paths in current tree.  
Residual risk = **dead dual helpers** that could be re-attached. This audit locks one production path and marks leftovers.

| Feature | New implementation | Old implementation | Production caller | Correct implementation | Action |
|---------|-------------------|--------------------|-------------------|------------------------|--------|
| Translation pack mode | `PackMode` = `slim` \| `hybrid` \| `fat` (`pack-mode.ts`, `pack-mode-resolver.ts`) | Type `'slim' \| 'fat'` only | `translation-pack-builder.ts`, `translation-pack-service.ts`, `job-service.ts` | `resolveTranslationPackMode` → builder with full `PackMode` | **DONE** — builder already imports `PackMode`; hybrid sections live |
| Translation style rules | `composeTranslationStyleRules` + `formatTranslationTaskHeader` (`translation-style-model.ts`) | `TRANSLATION_STYLE_RULES` (`translation-pack.ts`) | Builder uses compose only; `TRANSLATION_STYLE_RULES` has **zero** production imports | `composeTranslationStyleRules({ style, sourceLanguage, targetLanguage })` | **DONE** — keep deprecated export for API compat; do not import in prod |
| Pack language pair | Project `source_language` / `target_language` + `LanguageProfile` | Hardcoded Chinese→Vietnamese task header | `buildTranslationPack` reads project row / overrides | Generic pair via `formatTranslationTaskHeader` | **DONE** |
| Bootstrap prompt | `getLanguageProfile` + `preferred_target` (`bootstrap-prompt-builder.ts`) | Chinese→Vietnamese + `preferred_vi` in prompt text | Bootstrap analysis / knowledge seed | Generic `SOURCE_LANGUAGE` / `TARGET_LANGUAGE` | **DONE** — `preferred_vi` only in schema **ingest adapter** (`schemas/bootstrap.ts`) |
| Translation Notebook attach | `attachDriveLiveFirst` (`preferDriveLive: true`) | `attachFileFirstLegacy` (file → text → Drive) | `NotebookService.provision` / resume | Drive LIVE → file → copied text | **DONE** — legacy only when `preferDriveLive: false` (tests) |
| Research FULL corpus | `addFileSources` for packed parts | N/A | `full-novel-preprocess-orchestrator.ts` | File upload for Research (gate allows) | **KEEP** — not Translation path |
| Learning → Drive | `NotebookSyncService.syncDrive` + version probe | Direct `DriveSyncService.syncProject` from Learning | `learning-pipeline.ts` | NotebookSync only | **DONE** — guard `learning-drive-boundary.test.ts` |
| Drive IPC / OAuth | `DriveSyncService` | N/A | `register-handlers` Drive channels, account connect | Drive service owns OAuth + file sync API | **KEEP** — infra layer, not Learning |
| `chapters_since_sync` | `NotebookSyncService.evaluateSyncPolicy({ chapterCount })` | `maybeAutoSyncAfterChapter` (+1); `DriveSyncService.onChapterCompleted` parallel | Learning → `evaluateSyncPolicy` | Batch delta (101–103 → +3) | **HARDEN** — +1 helper must delegate; Drive counter tests-only |
| AiMemoryPage worker | `projects.resolveWorker({ purpose: 'notebook' })` | First READY/BUSY account override | `AiMemoryPage.tsx` refresh | Mapped Translation Notebook worker | **DONE** |
| Worker pool / jobs | `resolveProjectWorker` / `ProjectWorkerResolver` | Blind `listReady…[0]` / `accounts.find(READY)` | `worker-pool.ts`, preflight, gemini send | Mapped account; `ready_fallback` only if no binding | **DONE** |
| NOTEBOOK_SYNC_NOW probe | Resolve mapped worker when `accountId` omitted | Skip probe if omitted | IPC `NOTEBOOK_SYNC_NOW` | Same as `NOTEBOOK_REBUILD` | **FIX** |
| Bootstrap persist term pair | `DEFAULT_SOURCE_LANGUAGE` / `DEFAULT_TARGET_LANGUAGE` | Hardcoded `'zh-Hans'` / `'vi'` | `bootstrap-persist.ts` | Generic pair constants | **DONE** |
| Job translation style | `resolveProjectTranslationStyle(style_config)` | Always `'balanced'` in `TranslationPackService.build` | `ai-provider-manager` job send | Project/edition `style_config.preset` | **DONE** |

## Code truth (evidence)

### Pack / style / bootstrap

- `src/shared/constants/pack-mode.ts` — `PACK_MODES = ['slim','hybrid','fat']`
- `src/main/prompt/translation-pack-builder.ts` — `import type { PackMode }`; hybrid hot/delta branches; `composeTranslationStyleRules`
- `src/shared/constants/translation-style-model.ts` — pair-aware rules
- `src/shared/constants/translation-pack.ts` — `TRANSLATION_STYLE_RULES` marked `@deprecated`, unused by `src/main` / `src/renderer`
- `src/main/bootstrap/bootstrap-prompt-builder.ts` — `getLanguageProfile(prep.sourceLanguage|targetLanguage)`; no `preferred_vi` in prompt
- `src/shared/schemas/bootstrap.ts` — **legacy adapter only**: maps `preferred_vi` → `preferred_target` (DB/JSON compat — keep)

### Notebook / Learning / sync counter

- `NotebookService` provision/resume: `preferDriveLive: true`
- `learning-pipeline.ts`: no `DriveSyncService` import; uses `getNotebookSyncService().syncDrive` + `scheduleBackgroundVersionProbe` + `resolveProjectWorker`
- Production counter: `evaluateSyncPolicy` with `chapterCount` from batch
- Dead/dual: `maybeAutoSyncAfterChapter` (+1), `DriveSyncService.onChapterCompleted` (tests)

### Worker / renderer

- `AiMemoryPage`: `resolveWorker` → `setAccountId(resolved.accountId ?? dual.translation.accountId)`
- `worker-pool.ts`: `resolveProjectWorker` preferred account
- `gemini-webapi-provider.resolveAccount`: requires `aiAccountId` / `googleAccountId`; returns null otherwise
- Intentional global READY picks: SetupWizard connection test, system status poll (not project-scoped)

## Hardening actions this pass

1. `maybeAutoSyncAfterChapter` → delegate to `evaluateSyncPolicy({ chapterCount: 1 })` (no separate +1 business path)
2. `NOTEBOOK_SYNC_NOW` → resolve notebook worker via `ProjectWorkerResolver` when `accountId` omitted
3. Static regression scan: banned zh→vi / `preferred_vi` literals outside allowlist; project-sensitive files must not find-first READY
4. Do **not** delete schema `preferred_vi` adapter or DB migrations

## Out of scope (not FAIL)

- Live Google / NotebookLM smokes: NOT_RUN
- Research `addFileSources` for FULL corpus: intentional
- UI i18n marketing copy mentioning Chinese novels: product copy, not prompt wiring
- `ready_fallback` when project has **no** binding: documented resolver rule
