# Automatic Repair (Phase 14)

Finite repair loop after local QA fails. Default max **2** attempts → then `NEEDS_ATTENTION`.

## Repair reasons → strategies

| Reason | Strategy |
|--------|----------|
| `MISSING_PARAGRAPH` | Re-send **only** missing IDs (`buildRepairPack`) |
| `EMPTY_PARAGRAPH` | Re-send empty IDs only |
| `MALFORMED_OUTPUT` | Missing-only if partial; else full protocol re-ask |
| `TERM_VIOLATION` | Re-send affected paragraphs + locked term hints |
| `MEMORY_JSON_INVALID` | **Do not re-translate** — ask TERM/MEMORY JSON only |

## Attempt history (`job_attempts`)

Columns (migration **010**): `reason`, `input_ref`, `output`, `result` (+ existing attempt_number/state).

## Attention UI actions

On `NEEDS_ATTENTION`:

- **Retry** — resume loop (may call Gemini)
- **Skip** → `SKIPPED`
- **Manual Fix** → stay attention / `MANUAL_FIX`
- **Accept With Warning** → `ACCEPTED_WITH_WARNINGS`

## Crash recovery

`recoverCrashedAttempts` / `job:recover`: RUNNING attempts without `completed_at` → `CRASHED`.

## Modules

- `src/main/jobs/repair-strategies.ts`
- `src/main/jobs/repair-loop.ts`
- `src/main/services/job-service.ts`
- IPC: `job:list` / `job:get` / `job:attention` / `job:recover`
- UI: `JobsPage`

## Tests

- `tests/unit/jobs/repair-strategies.test.ts`
- `tests/unit/jobs/repair-loop.test.ts`
