# Jobs Page UX Audit

Date: 2026-08-29  
Scope: `/jobs` — tab **Công việc** (Operations Center redesign)

## Before

| Area | Issue |
|------|--------|
| Header | Technical subtitle; giant KPI card (~200px) |
| Counts | `QUEUED`, `WAITING_WORKER`, `PAUSED` merged as "Chờ" |
| Ready AI | `accounts.status === READY` only — ignored worker health / disabled |
| Section order | Workers first; attention buried |
| Export | Operational CSV/XLSX on main card |
| Fairness | Permanent implementation note on page |
| Provider | Stale `Gemini Notebook` from `providerType` |
| Knowledge | `Knowledge vN` on worker cards |
| Polling | `Promise.all` every 4s; one failure blocks refresh |
| Loading | Full-page skeleton on every poll |

## After

### Page structure

```
JobsPage
├── PageHeader (pause/resume + ⋯)
├── JobsSummaryStrip (compact ~60–80px)
├── Idle CTA (when nothing active)
├── ActionRequiredJobs
├── RunningJobCard[] 
├── ProjectQueueSection
├── AiAccountSection
├── RecentJobsSection
└── JobDetailDrawer + cancel Dialog
```

Hooks: `useJobsOverview`, `useJobsControls`  
Shared: `getUsableWorkerCount()` in `src/shared/utils/worker-usability.ts`

### Section order

1. Action Required (hidden if empty)
2. Running Jobs (hidden if empty)
3. Queue (hidden if empty; subtle empty line optional)
4. AI Accounts (always shown; empty guides to Accounts)
5. Recent Jobs (hidden if empty)

### Counts

| Metric | Definition |
|--------|------------|
| Đang dịch | `scheduler.inFlight` |
| Chờ | `QUEUED` + `WAITING_WORKER` |
| Tạm dừng | `PAUSED` (separate strip item when > 0) |
| Cần xử lý | `NEEDS_ATTENTION` + `FAILED` |
| AI sẵn sàng | `getUsableWorkerCount(workers, accounts)` |

### Header actions

- **Tạm dừng tất cả**: only when `runningCount > 0` and scheduler not paused
- **Tiếp tục tất cả**: when `scheduler.paused`
- **⋯**: concurrency settings, fairness tooltip, operational export (advanced tools only)

### Moved out of main UI

- Operational export → ⋯ → Báo cáo vận hành (Drawer, `showAdvancedTools`)
- Fairness one-per-project text → settings link + tooltip
- Concurrency knobs → Settings → Advanced (`SchedulerConcurrencyPanel`)
- Knowledge version, raw provider → Job detail Advanced

### Polling

- Interval: **10s** fallback
- `Promise.allSettled` — partial refresh on single endpoint failure
- Initial skeleton only; silent background updates

### Worker pause UX

No backend `pauseAfterCurrent` flag. Running account shows **Tạm dừng sau công việc hiện tại** (calls `accounts.disable` — stops new admissions; does not interrupt in-flight send unsafely).

### Provider label

`friendlyChannel()`: `Gemini` for local/web; `Notebook` only when `packMode === notebook_assisted` and notebook fields present.

### Tests added

- `tests/unit/jobs/worker-usability.test.ts`
- `tests/unit/jobs/jobs-utils.test.ts`

### Not changed (by design)

- Scheduler / job-service business logic
- IPC contracts
- `OperationalExportDialog` implementation (only placement)

## Verification checklist

- [ ] Export not on main card when `showAdvancedTools=false`
- [ ] Export available via ⋯ when `showAdvancedTools=true`
- [ ] Paused jobs not counted as waiting
- [ ] Empty sections omitted (no giant empty cards)
- [ ] Cancel active job shows confirmation with save reassurance
