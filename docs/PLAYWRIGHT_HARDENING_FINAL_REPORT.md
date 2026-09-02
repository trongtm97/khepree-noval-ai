# Playwright Hardening — Final Audit Report

**Date:** 2026-08-27  
**Scope:** Post–Playwright Hardening audit only. **No new features** in this pass.  
**Auditor:** Automated gate run + code/evidence inventory.

---

## Final status

# **NOT READY**

| Candidate status | Allowed? | Why |
| --- | --- | --- |
| PRODUCTION READY | **No** | Real Google smoke Overall ≠ PASS (`docs/REAL_GOOGLE_TEST_REPORT.md` = **NOT_RUN**). Rule: never claim Production Ready without Real Google PASS. |
| RELEASE CANDIDATE | **No** | `lint` FAIL, `typecheck` FAIL, full `npm test` FAIL (16+ unit failures). Packaging alone is not enough. |
| READY FOR EXTENDED TEST | **No** | Automated quality gates still red; Real Google + required manual scenarios not executed. |
| **NOT READY** | **Yes** | Honest state until unit/type gates green **and** Real Google A–H PASS **and** manual matrix filled. |

---

## Gate results (this run)

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | **FAIL** | ~517 problems (516 errors). Includes tests + config project-service noise. |
| `npm run typecheck` | **FAIL** | ~20+ `tsc` errors (notebook-provider, AiStatusPanel, AiMemoryPage `role`, future_sensitive fixtures, browser-runtime test engine id, etc.). |
| `npm test` | **FAIL** | ≥16 failing tests (see list below). Also unhandled rejections: DB closed while scheduler/heal-workers still async. |
| `npm run test:integration` | **PASS** | 2 files / 2 tests. |
| `npm run test:perf` | **PASS** | 1 file / 2 tests (~18s). |
| `npm run package` | **PASS** | Electron Forge packaging x64/win32 OK. |
| `npm run make` | **PASS** | Squirrel distributable OK → `out/make`. |
| `npm run test:google-smoke` | **NOT RUN** | No `google-smoke.config.json`; env `KHEPREE_NOVEL_AI_GOOGLE_SMOKE` not set. Report remains **NOT_RUN**. |

### Unit failures observed (this run)

- `tests/unit/i18n-ui.test.ts` — banned English UI markers  
- `tests/unit/automation/browser-session.test.ts` — dual worker same userDataDir  
- `tests/unit/bootstrap/future-leakage.test.ts` — character/relationship row shape (`future_sensitive`)  
- `tests/unit/db/database.test.ts` — multiple migration/persist/backup cases  
- `tests/unit/gemini/gemini-generation-lifecycle.test.ts` — OUTPUT_INCOMPLETE cutoff  
- `tests/unit/gemini/generation-lifecycle.test.ts` — OUTPUT_INCOMPLETE  
- `tests/unit/learning/learning-pipeline.test.ts` — consolidate + Drive sync  
- `tests/unit/notebook/notebook-provider.test.ts` — open/add sources / file upload  
- `tests/unit/portability/portability.test.ts` — backup/restore  
- `tests/unit/translation/translate-preflight.test.ts` — progress key  
- `tests/unit/utils/translate-channel.test.ts` — Web API / NotebookLM channel labels  

Scheduler suite also left **unhandled rejections** (`database connection is not open` via `healIdleWorkers`).

---

## Requirement matrix

Legend: **Y** = covered/pass evidence · **P** = partial · **F** = failing/broken evidence · **—** = not run / no harness · **N/A** = not applicable at that layer.

| Requirement | Unit | Integration | Packaged | Real Google | Status |
| --- | --- | --- | --- | --- | --- |
| Playwright version (`1.62.1` pinned in `package.json`) | Y (`browser-engine-resolver` / dependency health tests) | — | P (bundled with app) | — | **Impl OK / gates mixed** |
| Browser engine (Edge/Chrome prefer, Chromium fallback) | Y (`browser-engine-resolver`, `browser-dependency-health`) | — | P | — | **Impl OK** |
| Persistent runtime (one account → one context) | Y (`browser-runtime-manager`) | — | P | — (scenario F would cover) | **Impl OK / Real Google missing** |
| Profile leases | Y (`profile-lease-lock`, `profile-lock-nest`) | — | P | — | **Impl OK** |
| Surface detection | Y (`surface-selectors`, fixture Gemini tests) | — | — | — (A) | **Impl OK / Real Google missing** |
| Composer fill | Y (`gemini-prompt-input-editable`, send-handshake) | — | — | — (B/C) | **Impl OK / Real Google missing** |
| Send confirmation | Y (`gemini-send-handshake`) | — | — | — (B) | **Impl OK / Real Google missing** |
| Response anchoring | Y (`gemini-response-anchor`) | — | — | — (B/D) | **Impl OK / Real Google missing** |
| Generation completion | **F** (`OUTPUT_INCOMPLETE` unit FAIL this run) | — | — | — | **REGRESSED / FAIL** |
| Adaptive batching | Y (`batch-sizer`) | — | — | — | **Impl OK** |
| Continuation | Y (`continuation`) | — | — | — | **Impl OK** |
| FULL preprocessing | **P/F** (unit present; some bootstrap/resume type issues; preprocess fixture tests exist) | — | — | — (H) | **Partial / Real Google missing** |
| Research Notebook | Y (`notebook-role`, knowledge architecture) | — | — | — | **Impl OK / not Real-Google-proven** |
| Translation Notebook | Y (resolver/preflight/routing) | — | — | — (A) | **Impl OK / Real Google missing** |
| Request crash recovery | Y (`gemini-request-recovery`, lifecycle DB) | — | — | — | **Impl OK / not Real-Google-proven** |
| Provider health / preflight | Y (`provider-routing-preflight`, AI manager) | — | — | — | **Impl OK** |
| Packaged runner | Y (`runner-utility-process`, packaging worker tests) | — | **Y** (`npm run package` PASS) | — | **Packaged OK** |
| WebAPI worker | Y (`gemini-webapi-http`, worker packaging) | — | P | — | **Impl OK** |
| Knowledge compaction / pack modes | Y (`knowledge-budget-builder`, fat/slim pack paths) | — | — | — | **Impl OK** |
| Automation timeline / fail diagnostics | Y (`automation-timeline`) | — | — | — | **Impl OK** |
| Real Google smoke harness (opt-in) | Y (config guards) | — | — | **NOT_RUN** | **Harness ready / not executed** |

---

## Manual matrix (required — **not executed this audit**)

Operator must run on a **non-production SMOKE** project with a logged-in Google profile.

| # | Scenario | Result | Notes |
| --- | --- | --- | --- |
| 1 | 1 chapter translate | **NOT TESTED** | Needs Real Google / app UI |
| 2 | 3 chapters | **NOT TESTED** | |
| 3 | 10 continuous batches | **NOT TESTED** | Persistent runtime + leases |
| 4 | App restart mid-job | **NOT TESTED** | Crash recovery / resume |
| 5 | Network interruption | **NOT TESTED** | |
| 6 | Notebook reload | **NOT TESTED** | Aligns with smoke E |
| 7 | Google session persistence | **NOT TESTED** | Aligns with smoke F |
| 8 | FULL preprocess | **NOT TESTED** | Aligns with smoke H |
| 9 | Multi-account (if available) | **NOT TESTED** | Profile lease isolation |

---

## Real Google smoke

| Field | Value |
| --- | --- |
| Config present | **No** (`google-smoke.config.json` absent) |
| Env | `KHEPREE_NOVEL_AI_GOOGLE_SMOKE` unset |
| Report | [`docs/REAL_GOOGLE_TEST_REPORT.md`](REAL_GOOGLE_TEST_REPORT.md) → **Overall = NOT_RUN** |
| UI path | Diagnostics → Run Real Google Smoke (wired; not exercised) |

**To run later:**

```bash
copy google-smoke.config.example.json google-smoke.config.json
# profilePath + dedicated SMOKE notebook only
set KHEPREE_NOVEL_AI_GOOGLE_SMOKE=1
npm run test:google-smoke
```

---

## Inventory notes (implementation exists)

| Area | Primary locations |
| --- | --- |
| Playwright pin | `package.json` → `playwright@1.62.1` |
| Engine resolve | `src/main/automation/browser-runner/browser-engine-resolver.ts` |
| Persistent runtime | `playwright-worker-runtime.ts`, `browser-runtime-manager.ts` |
| Profile leases | `profile-lock.ts` |
| Surface / selectors | `surface-detector.ts`, `google-gemini.selectors.ts` |
| Composer / send / anchor / generation | `gemini-browser-provider.ts`, `conversation-snapshot.ts`, `response-anchor.ts`, `generation-lifecycle.ts` |
| Timeline / diagnostics | `automation-timeline.ts`, `diagnostics.ts` |
| Batching / continuation | `jobs/batch-sizer`, `jobs/continuation` |
| FULL preprocess | `bootstrap/full-novel-preprocess-*` |
| Notebooks | `notebook-resolver`, `notebook-role`, Research/Translation provision |
| Crash recovery | `gemini-request-recovery.ts`, `gemini_requests` lifecycle |
| Provider health | `provider-preflight.ts`, `ai-provider-manager.ts` |
| Packaged runner | `browser-runner/runner-*`, Forge package |
| WebAPI worker | `workers/gemini_webapi_worker`, `ai` adapters |
| Knowledge packs | `translation-pack-service`, `knowledge-budget-builder` |

---

## Blockers to leave NOT READY

1. **Real Google Overall ≠ PASS** (hard stop for Production Ready).  
2. **`npm test` red** — including generation-completion / notebook-provider / DB / portability / i18n.  
3. **`npm run typecheck` red** — must be clean before Release Candidate.  
4. **`npm run lint` red** — 500+ issues; treat as release gate debt.  
5. **Manual matrix empty** — required product proof not started.  
6. Scheduler async **DB-closed** unhandled rejections during unit run — reliability risk.

---

## Exit criteria (next actions — not done here)

1. Fix typecheck + critical unit failures (especially generation incomplete + DB/portability).  
2. Reduce lint to an agreed baseline or zero on `src/`.  
3. Provide `google-smoke.config.json` + logged-in profile → **Overall PASS** on A–H.  
4. Complete manual table rows 1–9 with PASS notes.  
5. Re-run this gate set; only then reconsider **READY FOR EXTENDED TEST** → **RELEASE CANDIDATE**.  
6. **PRODUCTION READY** only if Real Google PASS **and** all release checklist items PASS.

---

## Sign-off

| Field | Value |
| --- | --- |
| Final status | **NOT READY** |
| Production Ready? | **NO** |
| Packaging (package/make) | PASS |
| Real Google | NOT_RUN |
| Manual product matrix | NOT TESTED |
