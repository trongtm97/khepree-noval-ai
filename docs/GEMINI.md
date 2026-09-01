# Gemini Translation Providers

## Browser (Phase 12)

Playwright provider that sends `TranslationPack` into NotebookLM / Gemini chat and returns **raw model text only**. OUTPUT_PROTOCOL parsing happens in the jobs layer.

| Piece | Path |
|-------|------|
| Provider | `src/main/automation/providers/google/gemini-browser-provider.ts` |
| Service | `src/main/services/gemini-service.ts` |
| Adapter | `src/main/ai/adapters/playwright-gemini-adapter.ts` |

See historical detail below. Multi-backend routing: [AI_PROVIDER.md](./AI_PROVIDER.md).

## Web API (2026-08)

Python worker + [gemini-web2api](https://github.com/Sophomoresty/gemini-web2api) — [GEMINI_WEB_API_PROVIDER.md](./GEMINI_WEB_API_PROVIDER.md).

---

## Browser provider methods (detail)

| Piece | Path |
|-------|------|
| Provider | `src/main/automation/providers/google/gemini-browser-provider.ts` |
| Selectors | `src/main/automation/providers/google/selectors/google-gemini.selectors.ts` |
| Stabilizer | `src/main/automation/providers/google/response-stabilizer.ts` |
| Event log | `src/main/automation/browser-event-logger.ts` |
| Service | `src/main/services/gemini-service.ts` |
| Schema | migration **009** — `gemini_requests` |

## Provider methods

- `detectLogin()` — false → `LOGIN_REQUIRED`
- `openProjectNotebook(url)` — navigate to mapped notebook
- `createOrOpenTranslationThread()` — idempotent new/reuse chat
- `submitTranslationPack(pack, correlationId)` — embed `[NTS-CORR:uuid]` marker
- `waitForGenerationStart()` — loading / streaming DOM
- `waitForGenerationComplete()` — stabilization window (no fixed long sleep)
- `extractLatestResponse(correlationId)` — **correlation-scoped only** (never previous bubble)
- `detectQuotaLimit()` → `QUOTA_LIMIT`
- `detectUserActionRequired()` → `LOGIN_REQUIRED` \| `CAPTCHA` \| `QUOTA_LIMIT`
- `cancelGeneration()`

## Generation complete

1. Poll DOM: loading indicator + `data-streaming="1"` on response nodes.
2. Read text for matching `data-correlation-id`.
3. When text unchanged **and** streaming off for `stabilizationWindowMs` → stable.
4. `maxTimeoutMs` configurable per request (default 120s).

## Correlation ID

Each send gets UUID. Marker appended to prompt:

```
[NTS-CORR:00000000-0000-4000-8000-000000000099]
```

Response bubble must carry same `data-correlation-id` (real UI TBD; fixtures implement this).

## Resumable lifecycle (migration **023**)

`gemini_requests.lifecycle` is the source of truth:

`CREATED` → `COMPOSER_FILLED` → `SEND_CLICKED` → `SENT_CONFIRMED` → `GENERATION_STARTED` → `RESPONSE_SEEN` → `RESPONSE_CAPTURED` → `PARSED` → `COMPLETED`

Also: `FAILED`, `UNKNOWN_AFTER_CRASH`.

Persisted: `correlation_id`, `marker`, `thread_ref`, `notebook_id`, account, project, job, `lifecycle_at` timestamps.

**Critical:** after `SENT_CONFIRMED`, recovery **never** auto-resends. Open same notebook/thread, find marker, wait/capture. Resend only when prompt proven absent **and** lifecycle &lt; `SENT_CONFIRMED`.

Startup (`recoverJobsGeminiAndProfilesOnStartup`): `job_attempts` RUNNING→CRASHED, in-flight gemini_requests → abandon (pre-send) or `UNKNOWN_AFTER_CRASH` (post-send), plus profile leases — not only expired scheduler leases.

## Raw response storage

- Written to `{cache}/automation/{accountId}/gemini/raw-responses/{correlationId}.txt` for recovery.
- Project setting `style_config.retainRawResponses: true` keeps path in DB; default deletes file after handoff.
- Never stored in audit log.

## Browser event logs

`BrowserEventLogger` → `automation_events` table + JSONL under `{cache}/.../gemini/events/`.

## IPC

- `gemini:send` — `{ projectId, accountId, pack, headless?, maxTimeoutMs?, stabilizationWindowMs? }`

Requires notebook mapping `status: ready` for project × worker.

## Tests

Fixture DOM with simulated streaming: `tests/fixtures/gemini/chat-ready.html`  
Unit: `tests/unit/gemini/gemini-browser-provider.test.ts`

## Not in provider

- No `<TERM_DELTA>` / `<MEMORY_DELTA>` parsing
- No CAPTCHA / 2FA bypass
