# Core Quality Gate — Current

**Date:** 2026-08-27  
**Scope:** Stabilize core (no new product features). Audit code, not docs.  
**Overall result:** **PASS**

## Gate results

| Command | Exit | Result | Notes |
|--------|------|--------|--------|
| `npm run lint` | 0 | **PASS** | No `eslint-disable`; no `@ts-ignore` |
| `npm run typecheck` | 0 | **PASS** | `tsc --noEmit` |
| `npm test` | 0 | **PASS** | 109 files / 700 tests |
| `npm run test:integration` | 0 | **PASS** | 3 files / 4 tests |
| `npm run test:perf` | 0 | **PASS** | 1 file / 2 tests |
| `npm run package` | 0 | **PASS** | Electron Forge package (win32 x64) |

## Requirement audit (code truth)

### 1. Translation Notebook knowledge priority — PASS

**Code:** `src/main/notebook/attach-knowledge-sources.ts`  
`preferDriveLive !== false` → `attachDriveLiveFirst`:

1. Drive Live (`addDriveSources`, `preferLiveOverStatic: true`)
2. Static file upload (`addFileSources`)
3. Copied text (`addTextSources`)

`NotebookService.provision` / resume call `preferDriveLive: true` for Translation.  
Research FULL corpus stays file-upload-only in `full-novel-preprocess-orchestrator.ts` (`addFileSources` only).

Legacy `attachFileFirstLegacy` (file → text → Drive) only when `preferDriveLive: false` (tests).

### 2. Version / nonce verification via `08_SYNC_STATE` — PASS

**Not verified by source name alone.**

- `verifySources` / `NOTEBOOK_SOURCE_PRESENT` = name presence only → status stays `sync_pending`
- Real proof: `notebook-version-probe.ts` reads `NT_VERSION` / `NT_NONCE` vs pending Drive sync-state
- Match → `version_probe_status: verified` + Notebook `ready`
- `markNotebookVerified` ignored unless probe already verified

### 3–4. Pack modes + HYBRID — PASS

| Condition | Mode |
|-----------|------|
| READY + expected version + expected nonce + grounded + !dirty | **SLIM** |
| SYNC_PENDING / STALE | **HYBRID** (even without bindings) |
| No Notebook / WebAPI / grounding failed on ready | **FAT** |

HYBRID pack builder is implemented (`translation-pack-builder.ts` + hot memory delta), not a stub.

### 5. LearningPipeline Drive boundary — PASS

- No direct `DriveSyncService` import/call (guard: `learning-drive-boundary.test.ts`)
- Path: SQLite → Dirty → `NotebookSyncService.syncDrive` → Drive → `NOTEBOOK_SYNC_PENDING` → `scheduleBackgroundVersionProbe` (mapped account) → Verify → Ready

### 6. `chapters_since_sync` — PASS

- `evaluateSyncPolicy` increments by `chapterCount` delta (batch 101–103 → +3)
- Repair loop now counts **distinct chapters in the PASS batch** via paragraph→chapter lookup (`countCompletedChaptersFromBatch`), with job span fallback

### 7. Hot Memory content — PASS

`hot-memory-builder.ts` emits typed SQLite facts (TERM / CHARACTER / RELATIONSHIP / STORY / …).  
Never status/log strings like “Character delta after job…”.

### 8. AiMemoryPage account — PASS

Uses `projects.resolveWorker({ purpose: 'notebook' })` — Translation Notebook mapped account, not first READY.

### 9. Blind first-READY / `[0]` project picks — PASS (hardened)

Fixed project-sensitive sites:

| Area | Change |
|------|--------|
| `project-dto.ts` | Notebook/google health via `resolveProjectWorker` / mapped notebook |
| `translate-preflight.ts` | Requires `resolvedWorkerAccountId`; no first READY fallback |
| `worker-pool.ts` | POOL prefers `resolveProjectWorker` |
| `gemini-webapi-provider.ts` | Send requires `aiAccountId` / `googleAccountId`; no `listReadyByProvider()[0]` |
| `notebook-sync-service.getHealth` | Resolves mapped worker when account omitted |
| `NOTEBOOK_REBUILD` IPC | Passes resolved notebook worker |

Regression guard expanded: `tests/unit/regression/no-first-ready-worker.test.ts`.

Intentional remaining: global settings UI defaults, provider-level health display, `ready_fallback` only when project has **no** binding.

## Residual risk (not FAIL)

- **Live Google / NotebookLM / Gemini browser:** NOT_RUN (needs credentials + interactive browser).
- Windows Chromium profile `EBUSY` can still flake under heavy parallel load.
- Setup wizard still uses READY-first for **global** connection test (not project-scoped).

## Constraints honored

- No new feature scope beyond core stability listed above.
- No lint disable comments / `@ts-ignore`.
- Tests assert required behavior (Drive boundary, pack transitions, no first-READY, learning probe schedule).
