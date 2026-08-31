# AI Execution Worker Architecture Audit (Phase 1)

Date: 2026-08-29  
Scope: Provider-neutral job scheduling and send path (P0). No licensing/billing/UI.

## Problem (before)

- Scheduler only considered `worker_states` / `google_accounts`.
- `JobExecuteContext.accountId` always meant Google worker.
- `selectProvidersForJob({ googleAccountId })` forced Google identity at send time.
- ChatGPT/Meta adapters require `aiAccountId`; missing → `MISSING_ACCOUNT`.
- Preflight for browser AI used `readyAccounts[0]` when no account passed.

## Domain model

`AiExecutionTarget` (`src/main/ai/execution-target.ts`):

| Field | Purpose |
|-------|---------|
| `workerId` | Stable `providerId:accountId` |
| `providerId` / `providerType` | Routed AI backend |
| `accountKind` | `GOOGLE_ACCOUNT` or `AI_ACCOUNT` |
| `accountId` | Exact account row id |
| `profileDirName` | Browser profile when applicable |
| `concurrencyKey` | Exclusive lock key (one job per profile) |
| `legacyWorkerStateId` | `worker_states.id` for Google Gemini only |

## Resolver

`AiExecutionWorkerResolver.listAvailableTargets()`:

- **Playwright Gemini** → READY Google accounts via `worker_states`.
- **ChatGPT / Meta / Web API** → READY rows in `ai_accounts` (no Google required).
- Project primary provider + PIN/AUTO routing respected.
- BUSY accounts excluded via scheduler `inFlightMeta`.

## Scheduler

`AutomationScheduler` uses `ExecutionTargetPool` (not Google-only `WorkerPool`):

1. Fair project round-robin.
2. Pick READY execution target (provider-aware).
3. Persist `execution_*` columns on `jobs`.
4. Build `JobExecuteContext.executionTarget`.

## Send path

- `buildSendPromptOptions(executionTarget)` — single helper for `SendPromptOptions`.
- `selectProvidersForJob({ executionTarget })` — preflight uses exact scheduled account.
- `sendForJob` / `sendWithFallback` pass `executionTarget`, not bare `googleAccountId`.

## Preflight

`checkProviderForJob` accepts `executionTarget` or `accountRef`.  
Browser AI: **no** `readyAccounts[0]` when target account is specified.

## Persistence (migration 042)

**jobs** (additive, backward-compatible):

- `execution_worker_id`
- `execution_provider_id`
- `execution_provider_type`
- `execution_account_kind`
- `execution_account_id`

**ai_requests** — generic request lifecycle.  
**gemini_requests** — retained; not deleted.

## Concurrency

- One job per `concurrencyKey` (profile/account).
- Different ChatGPT accounts → parallel jobs.
- ChatGPT + Meta + Gemini → parallel when targets READY.
- Same ChatGPT account → second job waits (busy key).

## Cancellation / locks

- Profile lease acquired/released on exact `profilePath` for browser targets.
- Web API targets skip browser profile lock.
- Worker state `markBusy`/`markReady` only for Google `legacyWorkerStateId`.

## Test matrix

`tests/unit/jobs/execution-worker-matrix.test.ts`:

| Case | Status |
|------|--------|
| 0 Google + ChatGPT READY → job runs | ✅ |
| 0 Google + Meta READY → job runs | ✅ |
| 1 Gemini → serial | ✅ |
| 2 ChatGPT accounts → parallel | ✅ |
| ChatGPT + Meta parallel | ✅ |
| PIN ChatGPT + login required → no Meta | ✅ |
| `buildSendPromptOptions` mapping | ✅ |

## Static guard

Production routing must not require `googleAccountId` on `selectProvidersForJob`.  
Google-specific fields allowed only inside Gemini-Google adapter paths.

## Remaining / Phase 2

- UI for pinning non-Google execution accounts on jobs.
- Full `ai_requests` write path in all adapters (Gemini still uses `gemini_requests`).
- Cancel-by-exact-target for in-flight browser AI requests.
- `pinned_account_id` FK still references `google_accounts` (legacy PIN mode).
