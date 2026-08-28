# Account Availability — Health Consolidation

Date: 2026-08-29

## Problem

Account/worker health was represented in multiple layers with independent renderer logic:

- `google_accounts.status` vs `worker_states.health`
- `accountLaneStatus`, `resolveAccountUiState`, `resolveDashboardReadiness`, `isUsableWorker`, `translate-readiness-service` each applied different rules
- Dashboard ignored worker health; Jobs/Accounts could disagree on BUSY vs READY

## Solution

### Canonical domain resolver

| Layer | Path |
|-------|------|
| Types | `src/shared/constants/account-availability.ts` |
| Schema | `src/shared/schemas/account-availability.ts` |
| Pure logic | `src/shared/utils/account-availability.ts` → `resolveAccountAvailability()` |
| Main service | `src/main/services/account-availability-service.ts` |

### Availability enum

`READY` | `BUSY` | `PAUSED` | `LOGIN_REQUIRED` | `LIMITED` | `NEEDS_ATTENTION` | `UNAVAILABLE`

Each account DTO now includes `availability: AccountAvailabilityDto` with:

- `uiLane` — shared UI mapping (ready/running/paused/login/limited/attention)
- `usableForNewJob` — matches scheduler `WorkerPool.listAvailable()`
- `schedulerEligible` — raw pool eligibility
- `canOpenBrowser`, `canPause`, `canRemove`
- `autoRetryExpected` — LIMITED with future `limitedUntil`
- `activeJob` — project name, chapters, paragraph progress when BUSY

### API

`accounts.list()` returns `{ accounts, summary }` where `summary` uses the same resolver.

### Consumers updated

| Surface | Change |
|---------|--------|
| AccountsPage | Reads `availability` + `summary` from API; no local worker inference |
| Jobs (`accountLaneStatus`, `useJobsOverview`) | Uses `account.availability` when present |
| Dashboard (`resolveDashboardReadiness`) | Uses `availability.usableForNewJob` |
| Startup readiness | Uses `availability` not raw `status` |
| Translate preflight (`TranslateReadinessService`) | Friendly messages via `preflightMessage()` |
| `worker-usability.ts` | Delegates to `availability.usableForNewJob` when on DTO |

### READY definition

`READY` only when `WorkerPool.listAvailable()` would admit the worker — not merely `account.status === 'READY'`.

### Tests

- `tests/unit/shared/account-availability.test.ts` — resolver matrix
- `tests/integration/account-availability-consistency.test.ts` — lifecycle regression

## Scheduler alignment

`AccountAvailabilityService` calls `healIdleWorkers()` and `WorkerPool.listAvailable()` before resolving `schedulerEligible` / `usableForNewJob`. UI and scheduler share the same underlying eligibility probe.
