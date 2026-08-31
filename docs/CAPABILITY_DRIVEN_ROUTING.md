# Capability-Driven Provider Routing (Phase 3)

Behavior derives from **ProviderCapabilities**, not provider display names.

## Core modules

| Module | Role |
|--------|------|
| `src/main/ai/provider-capabilities.ts` | Registry: transport, account kind, chunk limits, timeouts |
| `src/main/ai/provider-chunking-policy.ts` | Batch/char budgets from capabilities |
| `src/shared/utils/provider-response-classifier.ts` | Per-provider soft-error classification |
| `src/main/ai/provider-retry-policy.ts` | Retry/fallback gates (send-confirmed unknown) |

## Capability registry

| Provider | transport | accountKind | chunk paragraphs |
|----------|-----------|-------------|------------------|
| PLAYWRIGHT_GEMINI | BROWSER | GOOGLE_ACCOUNT | 120 |
| PLAYWRIGHT_CHATGPT | BROWSER | AI_ACCOUNT | 80 |
| PLAYWRIGHT_META_AI | BROWSER | AI_ACCOUNT | 80 |
| GEMINI_WEB_API | LOCAL_WORKER | AI_ACCOUNT | 12 |

## Rules enforced

1. **Chunking** — `transport === 'BROWSER'` → browser chunking; not `providerType === PLAYWRIGHT_GEMINI`.
2. **Batch sizer** — ChatGPT/Meta get browser char budget (fixes prior Gemini-only bug).
3. **Soft errors** — `AI_SOFT_ERROR` + `ClassifiedResponseError`; no `GEMINI_SOFT_ERROR` for Meta/ChatGPT.
4. **Pack mode** — default `local_context` for all; notebook telemetry only when `notebook_assisted` + `supportsNotebookAssisted`.
5. **Provider ranking** — Translation Notebook no longer demotes non-Gemini providers.
6. **Repair** — uses channel provider type + capability; fallback to Web API when enabled.
7. **Inter-chunk delay** — only for `LOCAL_WORKER` transport.

## Quality gate

New production code must not use `providerType === 'PLAYWRIGHT_GEMINI'` to infer browser transport, notebook, or chunk size — use `getProviderCapabilities()` / `isBrowserTransportType()`.

## Tests

```bash
rtk npx vitest run tests/unit/ai/provider-capabilities-routing.test.ts
rtk npx vitest run tests/unit/jobs/batch-sizer.test.ts
```

## Not yet split

`AiProviderManager` remains facade (~2k lines). Capability logic extracted; full split into `AiRoutingService` / `TranslationAiSender` deferred.
