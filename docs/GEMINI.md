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

Python worker + `gemini_webapi` — [GEMINI_WEB_API_PROVIDER.md](./GEMINI_WEB_API_PROVIDER.md).

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
