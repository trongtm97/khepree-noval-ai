# Automation Scheduler (Phase 15)

Durable SQLite job queue — **not** in-memory-only.

## Job fields

| Field | Notes |
|-------|--------|
| project | `project_id` |
| chapter range | `chapter_from` / `chapter_to` |
| worker | `worker_id` + `worker_mode` / `pinned_account_id` |
| priority | lower runs first |
| state | see flow below |
| attempt | `attempt_count` |
| created / started / completed | timestamps |

Lease columns (`lease_owner`, `lease_expires_at`) enable crash recovery.

## Worker modes

| Mode | Behavior |
|------|----------|
| **PINNED** | Job always claims the pinned Google account / profile |
| **POOL** | Scheduler picks any **READY** worker (respects project assignments when present) |

## Worker health

`READY` → `BUSY` → `READY`  
`LIMITED` (after `QUOTA_LIMIT`, cooldown recorded — no spam retry)  
`NEEDS_ATTENTION` / `OFFLINE` / `DISABLED`

## Concurrency

- Global max concurrent workers (default **2**, `app_meta` / scheduler options).
- **One job per browser profile** (`ProfileLockManager` + worker `BUSY`).
- Multiple Google accounts = parallel Chromium instances (one profile each).

## Job flow

```
QUEUED → PREPARING → WAITING_WORKER → SENDING → WAITING_AI
  → PARSING → QA → REPAIRING (if needed) → COMPLETED
```

Terminal / control: `NEEDS_ATTENTION`, `FAILED`, `CANCELLED`, `PAUSED`, …

## User controls

| Action | Effect |
|--------|--------|
| Move | Change priority |
| Change worker | PINNED / POOL + optional pin |
| Pause all | Queued → `PAUSED` + pause flag |
| Resume all | `PAUSED` → `QUEUED` |
| Cancel | `CANCELLED` |
| Retry failed | Requeue `FAILED` / `NEEDS_ATTENTION` / `CANCELLED` |

## Restart / crash

1. On start: `recoverExpiredLeases()` → active leased jobs back to `QUEUED`.
2. Durable rows in SQLite survive process exit.
3. Graceful shutdown: stop claiming; wait in-flight; remaining → release lease + requeue.

## Key paths

- `src/main/jobs/scheduler.ts` — tick, claim, shutdown
- `src/main/jobs/worker-pool.ts` — PINNED / POOL selection
- `src/main/jobs/batch-executor.ts` — send → repair loop; QUOTA → LIMITED
- Migration **011** — queue + worker health columns

## Tests

`tests/unit/jobs/scheduler.test.ts` — 2 workers, crash lease recovery, PINNED, POOL, pause/cancel, shutdown, durable reopen.
