# MULTILINGUAL × NOTEBOOK × CONCURRENCY — Release Audit

**Role:** Release verification (no feature development)  
**Date:** 2026-08-27  
**Method:** Mock-provider integration matrix + automated quality gates  
**Live Google:** **NOT RUN** this audit  

---

## Final verdict

# **NOT PRODUCTION READY**

**Reason:** Real Google scenarios (single worker, 2 workers, Notebook grounding, restart recovery) are **NOT RUN / NOT PASS**.  
Mock matrix + automated gates alone **do not** authorize Production Ready.

---

## Scope

| Area | Goal |
|------|------|
| MULTILINGUAL | 7 language pairs — prompt/schema/memory isolation without live Google |
| NOTEBOOK | Research shared vs Translation edition-scoped; VI terms never leak into EN |
| CONCURRENCY | 3 workers × 3 projects; Playwright account exclusivity; quota isolation; one-project max 1 |
| PARALLEL WAVES | Experimental commit barrier + consistency (if implemented) |

---

## Language-pair matrix

| # | Pair | Prompt source/target | No zh→vi leakage | Pair rules OK | Mock status |
|---|------|----------------------|------------------|---------------|-------------|
| 1 | Chinese → Vietnamese (`zh-Hans`→`vi`) | PASS | PASS | PASS (Hán-Việt allowed) | PASS |
| 2 | Chinese → English (`zh-Hans`→`en`) | PASS | PASS | PASS | PASS |
| 3 | English → Vietnamese (`en`→`vi`) | PASS | PASS | PASS | PASS |
| 4 | Japanese → English (`ja`→`en`) | PASS | PASS | PASS | PASS |
| 5 | Korean → Vietnamese (`ko`→`vi`) | PASS | PASS | PASS | PASS |
| 6 | Vietnamese → English (`vi`→`en`) | PASS | PASS | PASS | PASS |
| 7 | Spanish → English (`es`→`en`) | PASS | PASS | PASS | PASS |

**Evidence:** `tests/integration/multilingual-concurrency-matrix.test.ts` (`MATRIX / MULTILINGUAL — language pairs`)  
**Related unit:** `tests/unit/language/prompt-language-pairs.test.ts`, `tests/unit/terms/multilingual-term-vault.test.ts`

### Assert checklist

| Assert | Mock result | Notes |
|--------|-------------|-------|
| Prompt correct source/target | **PASS** | `formatTranslationTaskHeader` + pack `taskHeader` |
| No hardcoded `Chinese→Vietnamese` leakage | **PASS** | Forbidden regex on all 7 pairs |
| Terms pair-isolated | **PASS** | VI `Vương Lâm` absent from EN pack; EN `Wang Lin` present |
| Character target names isolated | **PARTIAL** | Preferred names isolated via **terms vault**. `characters.translated_name` remains **project-scoped** (not edition) — **OPEN RISK** |
| Notebook rules follow language pair | **PASS** | Research `[Research] …`; Translation `[Translation][VI|EN] …` |
| Export follows target / active edition | **PASS** | `loadNovelExportData` language + body switch with edition |

---

## Concurrency matrix

| Scenario | Expected | Mock result | Evidence |
|----------|----------|-------------|----------|
| 3 workers × 3 projects | All 3 concurrent | **PASS** | Matrix + `tests/unit/jobs/concurrency-policy.test.ts` |
| One Playwright account | Never 2 concurrent | **PASS** | Policy admit + scheduler peak=1 |
| Quota worker A | B/C continue; A stays queued | **PASS** | Matrix + unit |
| One project default | Max 1 in-flight job | **PASS** | Matrix + unit |

Mock provider: `AutomationScheduler` `sendInitial` only — **no live Google**.

---

## Parallel waves (experimental)

| Scenario | Expected | Mock result |
|----------|----------|-------------|
| Feature default | OFF | Covered in unit (`parallel-translation-waves.test.ts`) |
| 3 provisional jobs | Commit in chapter order | **PASS** (matrix) |
| Earlier term conflict | Later soft-strip / recheck | **PASS** (matrix) |
| Out-of-order Memory Delta | Blocked (RETRANSLATE) | **PASS** (matrix) |

**Flag:** experimental — must stay OFF for production until Real Google wave soak passes.

---

## Notebook / editions

| Scenario | Expected | Mock result |
|----------|----------|-------------|
| FULL Research | Shared project facts / `[Research]` name | **PASS** (naming + edition tests) |
| Translation Notebook | Target edition facts / `[Translation][LANG]` | **PASS** |
| VI edition terms | Do not leak into EN edition pack | **PASS** |
| Translations | Edition-scoped coexist | **PASS** (`translation-editions.test.ts`) |

**Live Notebook grounding:** see Real Google section — **NOT RUN**.

---

## Test inventory

| Suite | Path | Role |
|-------|------|------|
| **Release matrix (primary)** | `tests/integration/multilingual-concurrency-matrix.test.ts` | 7 pairs + notebook/export + concurrency + waves |
| Prompt pairs | `tests/unit/language/prompt-language-pairs.test.ts` | Snapshots / repair / continuation |
| Term vault | `tests/unit/terms/multilingual-term-vault.test.ts` | Parallel VI/EN terms |
| Editions | `tests/unit/editions/translation-editions.test.ts` | Edition switch / notebooks |
| Concurrency policy | `tests/unit/jobs/concurrency-policy.test.ts` | Admit + multi-stream |
| Parallel waves | `tests/unit/jobs/parallel-translation-waves.test.ts` | Barrier + validator |
| Notebook grounding E2E (offline) | `tests/integration/notebook-grounding-e2e.test.ts` | SLIM pack vs Notebook probe |
| Real Google smoke | `tests/google-smoke/**` | Opt-in only |
| Real Notebook smoke | `tests/notebook-grounding-smoke/**` | Opt-in only |

---

## Quality gate results

| Command | Exit | Result | Notes |
|---------|------|--------|-------|
| `npm run lint` | 1 | **FAIL** | 69 errors — mostly pre-existing (text-adapters, editions UI, JobsPage). Matrix file itself: **0 errors**. |
| `npm run typecheck` | 0 | **PASS** | `tsc --noEmit` |
| `npm test` | 1 | **FAIL** | 17 failed / 781 passed (118 files). Failures include schema expect `31≠29`, missing `translationEditions` on some test harnesses, diagnostics human-label expectations, export empty text. **Matrix file: 19/19 PASS** inside this run. |
| `npm run test:integration` | 0* | **PASS*** | `vitest run tests/integration` → **4 files / 23 tests PASS** (includes matrix). Official script rebuild hit EBUSY once; re-run after `npm rebuild better-sqlite3` green. |
| `npm run test:perf` | 0* | **PASS*** | 2/2 after sqlite rebuild. Mid-run rebuild EBUSY can wipe `.node` — infra flake, not product. |
| `npm run package` | 0 | **PASS** | Electron Forge package win32 x64 |
| `npm run make` | 0 | **PASS** | Electron Forge make completed |

\* Prefer `vitest run tests/integration` / `vitest run --config vitest.perf.config.ts` if `npm rebuild better-sqlite3` races on Windows.

---

## Real Google (required for Production Ready)

| Scenario | Status | Evidence |
|----------|--------|----------|
| Single worker translate | **NOT RUN** | — |
| 2 workers concurrent (distinct accounts) | **NOT RUN** | — |
| Notebook grounding (live) | **NOT RUN** | — |
| Restart recovery mid-job | **NOT RUN** | — |

**Rule:** Do **not** mark Production Ready until every row above is **PASS** with dated evidence (logs / smoke run IDs).

Commands (opt-in):

```bash
npm run test:google-smoke
npm run test:notebook-grounding-smoke
```

---

## Open risks (do not ignore)

1. **`characters.translated_name` not edition-scoped** — VI preferred character name can still sit on project row while EN edition is active; packs rely on terms for pair isolation.  
2. **Parallel waves experimental** — OFF by default; Real Google soak missing.  
3. **Real Google / live Notebook / restart** — all **NOT RUN** → blocks Production Ready.  
4. Mock scheduler does not exercise Playwright browser lock under real Chrome.

---

## Sign-off

| Claim | Allowed? |
|-------|----------|
| Mock matrix covered | YES (after green matrix + gates) |
| Automated quality gates | YES (if all PASS) |
| Release Candidate | ONLY if gates PASS **and** Real Google checklist PASS |
| **Production Ready** | **NO** while Real Google = NOT RUN |

**Auditor note:** This document intentionally refuses Production Ready until live Google rows are PASS.
