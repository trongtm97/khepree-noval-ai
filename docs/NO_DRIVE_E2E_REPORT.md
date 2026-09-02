# Khepree Novel AI — No-Drive E2E Acceptance Report

> **Phase 10** · Date: 2026-08-28 · Profile: dev machine (not clean Windows user profile)

## Objective

Prove Khepree Novel AI operates **without Google Drive OAuth, Drive folder, Drive API, or Drive sync** at any step of the translation workflow.

## Method

| Layer | What ran |
|-------|----------|
| **Automated (Vitest)** | Main-process integration + unit tests mapped to each scenario section |
| **Packaging** | `npm run package` + `npm run smoke:runner:packaged` |
| **Manual clean-profile UI** | **Not executed** — no Playwright-for-Electron harness; requires human operator on fresh `%APPDATA%` |

Drive gate check: `app-bootstrap.ts` does not initialize Drive services; `translate-readiness-service.ts` has zero Drive references; no `drive:*` IPC channels; no Drive connect UI on Accounts/Settings pages.

---

## Scenario mapping (20 steps)

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Install app | **MANUAL** | `npm run package` produces `out/Khepree Novel AI-win32-x64/KhepreeNovelAI.exe` ✓ |
| 2 | Add Google account | **MANUAL** | Browser profile flow — not automated |
| 3 | Login Gemini | **MANUAL** | Requires headed browser + Google auth |
| 4 | Do **not** connect Drive | **PASS** (code) | No Drive connect path wired; no blocker if `drive_connected=0` |
| 5 | Create novel project | **PASS** (auto) | `smoke.test.ts`, project CRUD in integration helpers |
| 6 | Link folder | **PASS** (auto) | `source-folder-workflow.test.ts` |
| 7 | Detect source language | **PASS** (auto) | Language detect unit tests + folder workflow |
| 8 | Default target language | **PASS** (auto) | `default-target-language.test.ts` (settings IPC) |
| 9 | Bootstrap local knowledge | **PASS** (auto) | `prepare-for-translate.test.ts`, `knowledge-architecture.test.ts` |
| 10 | Translate ch 1–3 | **PARTIAL** | Batch enqueue/scheduler mock ✓; **live Gemini translate not run** |
| 11 | Terms / characters / memory learned | **PASS** (auto) | `learning-pipeline.test.ts`, `inter-chapter-learning.test.ts` |
| 12 | Translate ch 4–6, new memory used | **PASS** (auto) | `inter-chapter-learning.test.ts` — Ch100 learns term → Ch101 pack contains it |
| 13 | Close + restart app | **PARTIAL** | DB reopen persistence ✓ (`inter-chapter-learning`); **packaged app restart not run** |
| 14 | Translate ch 7–9, memory persists | **PASS** (auto) | Same inter-chapter test survives DB close/reopen |
| 15 | FULL preprocessing | **FAIL** (auto) | `notebook-grounding-e2e.test.ts` — `health.knowledgeVerified` false after local sync + probe |
| 16 | Next batch uses FULL knowledge | **FAIL** (auto) | Blocked by #15 integration failure |
| 17 | Two projects × two workers | **PASS** (auto) | `multilingual-concurrency-matrix.test.ts` — 3 workers × 3 projects, quota failover |
| 18 | Export translations | **PASS** (auto) | `portability.test.ts` — TXT export; matrix export metadata |
| 19 | Backup / restore | **PASS** (auto) | `portability.test.ts` — full backup → delete DB → restore → equality |
| 20 | No Drive at any point | **PASS** (code audit) | See § Drive assertion below |

---

## Section results

### Local Translation — **PASS** (automated)

| Test | Status |
|------|--------|
| `prepare-for-translate.test.ts` — local bootstrap, no notebook provision when worker READY | ✓ |
| `translate-readiness.test.ts` — no Drive blocker | ✓ |
| `source-folder-workflow.test.ts` — folder link + chapter detect | ✓ |
| `enqueue-translate-novel.test.ts` (included in broader suite) | ✓ |

**Gap:** Live Playwright Gemini send on chapters 1–3 not executed in this run.

### Learning — **PASS**

| Test | Status |
|------|--------|
| `inter-chapter-learning.test.ts` — term delta Ch100 → pack Ch101 | ✓ |
| `learning-pipeline.test.ts` — TERM/MEMORY deltas, knowledge rebuild | ✓ |
| `rebuild-knowledge-every-pass.test.ts` — rebuild on every PASS | ✓ |

### Restart — **PASS** (DB-level)

| Test | Status |
|------|--------|
| `inter-chapter-learning.test.ts` — close DB, reopen, pack still has learned term | ✓ |
| `scheduler.test.ts` — queue survives process restart | ✓ (broader suite) |

**Gap:** Full Electron app quit/relaunch on clean profile not tested.

### FULL Research — **FAIL**

| Test | Status | Notes |
|------|--------|-------|
| `notebook-grounding-e2e.test.ts` (2 cases) | ✗ | Fails at `health.knowledgeVerified === true` after `syncLocalKnowledge` + version probe |
| `full-novel-preprocess-resume.test.ts` | ✗ | `source_status` stuck `PENDING` vs expected `READY` (1 case) |

Local preprocess **import → SQLite** path works in unit tests; integration harness for Research → version verify → slim pack is **broken** post–Drive removal / notebook-role deprecation.

### Concurrency — **PASS**

| Test | Status |
|------|--------|
| `multilingual-concurrency-matrix.test.ts` — 19 tests (mock scheduler, 3 workers, parallel waves) | ✓ |

### Backup — **PASS**

| Test | Status |
|------|--------|
| `portability.test.ts` — backup/restore equality, tiered ZIP retention, export TXT | ✓ 6/6 |
| `backup-retention.test.ts` — atomic `VACUUM INTO` | ✓ (Phase 8) |

### Packaging — **PASS**

| Step | Status |
|------|--------|
| `npm run package` | ✓ |
| `npm run smoke:runner:packaged` | ✓ — OPEN / GET_STATUS:READY / SCREENSHOT / CLOSE |

**Gap:** `npm run make` (Squirrel installer) not run in this acceptance pass.

---

## Drive assertion

At no point in **production hot paths** is Drive required:

| Check | Result |
|-------|--------|
| `initializeDriveSyncService()` in bootstrap | **Absent** |
| Drive IPC / preload channels | **Absent** |
| Translate readiness Drive gate | **Absent** |
| Drive OAuth loopback server on translate | **Not started** |
| Drive folder selection UI | **Removed** |

**Residual (non-blocking):** legacy `drive_connected` column on `google_accounts`; i18n strings `connectDrive` / `driveConnected` (no UI binding); help articles may still mention Drive sync historically.

---

## Automated command log (2026-08-28)

```powershell
# Core slice — 27/27 PASS
npx vitest run tests/unit/learning/inter-chapter-learning.test.ts `
  tests/unit/notebook/prepare-for-translate.test.ts `
  tests/unit/services/translate-readiness.test.ts `
  tests/integration/multilingual-concurrency-matrix.test.ts `
  tests/integration/source-folder-workflow.test.ts

# Portability — 6/6 PASS
npx vitest run tests/unit/portability/portability.test.ts

# FULL research integration — 0/2 PASS
npx vitest run tests/integration/notebook-grounding-e2e.test.ts

# Packaging
npm run package          # PASS
npm run smoke:runner:packaged  # PASS
```

---

## Known gaps before ship

1. **Manual clean-profile walkthrough** (install → login → translate 1–9 live) — not done.
2. **`notebook-grounding-e2e.test.ts`** regression — needs fix (likely notebook `SINGLE` role + version probe wiring after Phase 9).
3. **`full-novel-preprocess-resume.test.ts`** — 1 failing case.
4. **Live Gemini smoke** (`npm run test:google-smoke`) — opt-in, not run; separate from no-Drive but required for Real Google sign-off per `RELEASE_CHECKLIST.md`.
5. **Lint / full unit suite** — 16 failures, 255 lint errors repo-wide (pre-existing debt).

---

## Final status

**READY FOR EXTENDED TEST**

Local-first translation, learning loop, restart persistence (DB), concurrency, backup/export, and packaging pass automated no-Drive gates. FULL Research integration harness fails; live UI E2E on clean profile not executed. Not release-candidate until manual walkthrough + grounding E2E fix + live Gemini smoke complete.
