# FINAL RELEASE AUDIT — Khepree Novel AI

**Role:** Independent Release Engineer  
**Date:** 2026-08-24  
**App version:** 0.1.0  
**Schema:** 13  
**Method:** Code-first review (no trust of prior “complete” claims) + automated gates  
**Fixes applied this audit (surgical only):**

1. Await scheduler shutdown before `closeDatabase()` (`main.ts`)  
2. Delete stale `-wal`/`-shm` on full restore (`backup-archive.ts`)  
3. Restrict `file://` navigation to same renderer directory (`window-security.ts`)  

No Phase-20 feature work (Gemini `sendInitial` wiring) — that remains a **BLOCKER**.

---

## Final verdict

# **NOT READY**

**Not RELEASE CANDIDATE.**  
**Not PRODUCTION READY.**

Reasons: core translation scheduler cannot send to Gemini; lease/duplicate-run risk; several HIGH security/data gaps; all manual RELEASE_CHECKLIST scenarios untested in this audit.

---

## Severity summary

| Severity | Count (open after surgical fixes) |
|----------|-----------------------------------:|
| BLOCKER  | 4 |
| HIGH     | 14 |
| MEDIUM   | 18 |
| LOW      | 12 |

---

## BLOCKER

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| B1 | **Scheduler Gemini senders not wired** | `scheduler-singleton.ts:26-33` default `sendInitial` rejects; `main.ts` calls `initializeAutomationScheduler({ autoStart: true })` with no senders; `batch-executor.ts:83-87` default `sendRepair` rejects; `PROJECT_STATE.md` Phase 20+ Not Started | Enqueued jobs fail immediately — product core broken |
| B2 | **Production translation path incomplete** | Manual `gemini:send` exists; scheduler path does not use `GeminiService` / pack builder | Automated Jobs UI cannot translate |
| B3 | **Job lease never renewed** | `renewLease` only defined (`job-repository.ts:265`); never called; lease = 120s = Gemini max timeout | Mid-translation lease expiry → requeue while first run still active → **duplicate jobs / races** |
| B4 | **Crash mid-send leaves stalled state** | Startup only `recoverExpiredLeases` (`scheduler.ts:76-79`); no bulk `recoverCrashedAttempts`; `gemini_requests` can stay `running` | Jobs stuck until lease expires; operator must know `job:recover` |

---

## HIGH

| ID | Issue | Evidence |
|----|-------|----------|
| H1 | Auto/manual DB backup copies **full DB including encrypted secrets** | `auto-backup.ts:88-89`, `136-140` vs sanitized portable backup |
| H2 | `import:preview` accepts **arbitrary filesystem path** (IPC) | `ImportPreviewRequestSchema` + handler; no dialog/allowlist |
| H3 | Renderer receives **absolute browser profile path** | `account-dto.ts` |
| H4 | Profile lock **in-process only** — second instance can open same profile | `profile-lock.ts` |
| H5 | Interactive repair **arbitrary `startUrl`** on persistent Google profile | `diagnostics.ts` schema + service |
| H6 | Selector override / diagnostics export **unconstrained paths** | loadOverrides / export outputPath |
| H7 | No backup **restore UI** (backend exists) | `PortabilityPage.tsx` — create only |
| H8 | Gemini provider **missing SESSION_EXPIRED** detection | `gemini-browser-provider.ts` vs `browser-session.ts` |
| H9 | Gemini fail does not mark **account** LOGIN/NEEDS_ATTENTION | `gemini-service.ts` catch |
| H10 | Shutdown previously raced DB close | **Mitigated** this audit (`main.ts` await) — re-verify in soak |
| H11 | Full restore stale WAL | **Mitigated** this audit — still needs integration test assertion |
| H12 | `file://` open navigation | **Mitigated** this audit — same-dir only |
| H13 | Repair retry / job config **accountId** gap vs `worker_id` claim | `register-handlers` repair path notes |
| H14 | Setup wizard **blocks** without Google account | May be intentional; blocks “install and explore” |

---

## MEDIUM

| ID | Issue |
|----|-------|
| M1 | Log redaction shallow (keys only; `message` not scrubbed) |
| M2 | `includeCredentials` backup via IPC without step-up confirm |
| M3 | Migration backup via `copyFileSync` without WAL checkpoint |
| M4 | Migration checksum stored, never verified on boot |
| M5 | Terms table no UNIQUE `(source, scope, scope_ref)` — manual create can duplicate |
| M6 | Memory “resolve” marks status only — does not apply `proposed_value` |
| M7 | `accept_with_warning` does not persist translations |
| M8 | Raw Gemini response deleted after ~5s unless retain flag |
| M9 | Duplicate paragraphs → MANUAL_REVIEW only (no auto-repair) — OK design, ops load |
| M10 | Drive OAuth revoked does not affect Gemini (OK) but sync fails silently to UI unless checked |
| M11 | Electron `userData` path ≠ `%APPDATA%\KhepreeNovelAI` (split storage) |
| M12 | Unsigned installer without `WINDOWS_CERTIFICATE_*` |
| M13 | Transient `RetryPolicy` unused on Gemini send path |
| M14 | Orphan `RUNNING` gemini_requests / jobs without lease |
| M15 | Attempt output truncated ~50k |
| M16 | Batch AI translation persist not one transaction |
| M17 | Setup Gemini test step weak (profile probe only) |
| M18 | Browser recovery on `child-process-gone` passes `null` manager (no-op) |

---

## LOW

| ID | Issue |
|----|-------|
| L1 | `http:` allowed in `openExternal` |
| L2 | Legacy unused `google_oauth_credentials` table |
| L3 | Gemini URL constants duplicated |
| L4 | Translation create = two statements without wrapping txn |
| L5 | No startup `PRAGMA integrity_check` |
| L6 | Drive isolated from translation (documented) |
| L7 | Notebook gate is DB status, not live UI probe at send |
| L8 | Code signing optional |
| L9 | SmartScreen on unsigned builds |
| L10 | README historically stale (refreshed in prior phase; verify) |
| L11 | Phase docs vs CHANGELOG known gaps |
| L12 | Test fixtures hard-code UUIDs (tests only — OK) |

---

## Failure simulation matrix

| Scenario | Expected | Actual code behavior | Data loss? | Verdict |
|----------|----------|----------------------|------------|---------|
| Crash mid-Gemini | Recover or NEEDS_ATTENTION | Lease expire → requeue; attempts may stay RUNNING; no auto crashed-attempt sweep | Source safe; AI output not persisted until QA PASS; **duplicate-run risk** | **FAIL** readiness |
| Internet loss / timeout | NEEDS_ATTENTION | Maps to non-retryable attention; RetryPolicy unused | Source safe | **PARTIAL** |
| Quota | Cooldown / queue | Worker LIMITED + job QUEUED (30m) | Source safe | **PASS** design |
| Google logout / CAPTCHA / LOGIN | NEEDS_ATTENTION | Yes via batch/worker path | Source safe | **PASS** design |
| SESSION_EXPIRED | Same | **Not detected** in Gemini provider | May misclassify | **FAIL** |
| Notebook unavailable | Block send | Throws before send → NEEDS_ATTENTION | Source safe | **PASS** |
| Drive OAuth revoked | Sync fail, translate OK | Drive `auth_required`; Gemini independent | Translate OK | **PASS** |
| Broken JSON | Repair → attention | Parser + repair max 2 → NEEDS_ATTENTION | Source safe | **PASS** |
| Missing 3 paragraphs | Auto-repair | MISSING_PARAGRAPH repair ≤2 then attention | Source safe | **PASS** |
| Duplicate paragraphs | Attention | MANUAL_REVIEW → NEEDS_ATTENTION | Source safe | **PASS** |
| User closes app | Graceful | **Fixed:** await scheduler then close DB | Residual mid-write risk lower | **PARTIAL→improved** |
| Windows restart | Recover leases | `recoverExpiredLeases` only; stuck until lease expiry | Source safe | **PARTIAL** |
| Scheduler job run | Translate | **Rejects** — sendInitial not configured | N/A | **FAIL** |

---

## Subsystem status

| Subsystem | Status | Notes |
|-----------|--------|-------|
| Electron security | **PARTIAL** | Hardening PASS; IPC import path + profile path leak HIGH |
| Database migrations | **PASS** | v1–13; checksum verify missing |
| SQLite integrity | **PARTIAL** | FK ON; no startup integrity_check; WAL restore mitigated |
| Multi-account isolation | **PARTIAL** | Profile path binding OK; in-process lock only |
| safeStorage | **PASS** | No plaintext fallback |
| Google OAuth (Drive) | **PASS** code | Encrypted secrets; live OAuth **NOT TESTED** |
| Drive sync | **PASS** code | Live revoke **NOT TESTED** |
| Persistent browser profiles | **PARTIAL** | Path traversal blocked; multi-instance lock weak |
| Gemini provider | **PARTIAL** | Manual send exists; SESSION_EXPIRED gap; scheduler unwired |
| Notebook provider | **PASS** unit | Live **NOT TESTED** |
| Response parsing | **PASS** | Conservative; no invent |
| Local QA | **PASS** unit | |
| Auto repair | **PASS** unit | max 2; no infinite loop |
| Job recovery | **FAIL** for prod | Lease/duplicate; senders missing |
| Term vault | **PARTIAL** | Import OK; possible duplicate rows |
| Memory conflicts | **PASS** | AI cannot silent overwrite |
| Editor human lock | **PASS** | AI persist respects lock |
| Export | **PASS** unit | Live formats **NOT TESTED** |
| Backup | **PARTIAL** | Auto-backup retains secrets |
| Restore | **PARTIAL** | No UI; WAL fix applied |
| Windows packaging | **PASS** automated | make succeeded prior session; re-run below |

---

## Automated gates (this audit run)

| Gate | Result |
|------|--------|
| `npm run lint` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm test` (209 unit) | **PASS** |
| `npm run test:integration` | **PASS** |
| `npm run test:perf` | **PASS** |
| `npm run package` | **PASS** |
| `npm run make` | **PASS** (`KhepreeNovelAISetup.exe`) |

Automated packaging does **not** override product BLOCKERs. Jobs still cannot translate via scheduler.

---

## What would be required for RELEASE CANDIDATE

Minimum:

1. Wire production `sendInitial` / `sendRepair` to `GeminiService` + pack builder (**B1/B2**).  
2. Call `renewLease` during long sends / raise lease above max generation+repair time (**B3**).  
3. Startup: recover crashed attempts + stuck `gemini_requests` (**B4**).  
4. Sanitize auto/manual DB backups (strip secrets by default) (**H1**).  
5. Constrain `import:preview` to dialog-selected / managed paths (**H2**).  
6. Restore UI + confirm overwrite (**H7**).  
7. SESSION_EXPIRED in Gemini provider (**H8**).  
8. All automated gates PASS.  
9. Core manual checklist items PASS on Win10/11 x64.

## What would be required for PRODUCTION READY

All RELEASE CANDIDATE items **plus**:

- All 18 `RELEASE_CHECKLIST.md` scenarios **PASS**  
- No open BLOCKER or HIGH  
- Code signing enabled for public distribution  
- Real update server or documented manual-only update policy accepted  

---

## Explicit non-claims

- Prior chat claims of “Phase complete” / “production packaging done” are **not** acceptance criteria.  
- Unit tests proving repair/QA in isolation do **not** prove the live scheduler path.  
- This audit does **not** mark PRODUCTION READY or RELEASE CANDIDATE.
