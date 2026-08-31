# AI Provider Architecture

NovelTrans routes all model calls through **AI Provider Manager**. Translation Engine / job repair loop never import Playwright or `gemini_webapi` directly.

## Routing stack

```
Translation Engine (BatchExecutor)
        ↓
Ai Routing (AiProviderManager — priority, capabilities, fallback)
        ↓
Execution Target
├── PLAYWRIGHT_GEMINI    → GeminiService (Playwright)
├── GEMINI_WEB_API       → localhost Python worker
├── PLAYWRIGHT_CHATGPT   → PlaywrightBrowserAiService
└── PLAYWRIGHT_META_AI   → PlaywrightBrowserAiService
        ↓
Provider-neutral TranslationPackDto (same prompt assembly for all)
```

## Provider types

| Type | Implementation | Google account required? |
|------|----------------|--------------------------|
| `PLAYWRIGHT_GEMINI` | `PlaywrightGeminiAdapter` → `GeminiService` | Yes (browser session) |
| `GEMINI_WEB_API` | `GeminiWebApiProvider` → localhost FastAPI | Session cookies only |
| `PLAYWRIGHT_CHATGPT` | `PlaywrightChatGptAdapter` → `PlaywrightBrowserAiService` | **No** |
| `PLAYWRIGHT_META_AI` | `PlaywrightMetaAiAdapter` → `PlaywrightBrowserAiService` | **No** |
| `GEMINI_OFFICIAL` | Seeded `DISABLED` | Future |

ChatGPT and Meta AI use dedicated `ai_accounts` browser profiles — independent of Google `worker_states`.

## Interface (`IAIProvider`)

`initialize` · `healthCheck` · `sendPrompt(pack)` · `cancelRequest` · `getStatus` · `close` · optional `streamResponse`

Input: **`TranslationPackDto`** — language pair from project/edition, terms, memory, source paragraphs (not hardcoded to any single language pair).  
Output: `AIResponse` with status `SUCCESS` | `LOGIN_REQUIRED` | `SESSION_EXPIRED` | `RATE_LIMIT` | …

## Selection & fallback

- Ordered by `ai_providers.priority` among `enabled = 1`.
- Capability-driven routing (transport, char budget, notebook grounding flags).
- Fallback (`app_meta` `ai.fallback.enabled`) only on configured statuses (default `RATE_LIMIT`, `SERVICE_UNAVAILABLE`) and only if `fallback_allowed`.
- Disabled providers never used.

## Database (migration 016+)

- `ai_providers` · `ai_accounts` · `ai_models`
- Google workers: legacy `worker_states` + account rows
- AI browser accounts: `ai_accounts.profile_dir_name` → `%APPDATA%/NovelTrans/browser-profiles/`
- Web API session cookies: `secrets` via `SecretKind: gemini_web_session` (safeStorage)

## Job wiring

`main.ts` injects:

```ts
sendInitial: (ctx) => aiProviders.manager.sendForJob(ctx)
sendRepair: (req) => aiProviders.manager.sendRepair(req)
```

Job states unchanged (`WAITING_AI` still applies). `executionTarget` on job records identifies provider + account.

## Test status

| Layer | Status |
|-------|--------|
| Mock integration (all providers) | **REAL TEST PASSED** — `tests/integration/multi-provider-acceptance.test.ts` |
| Live browser per provider | **NOT REAL TEST PASSED** — see [MULTI_PROVIDER_ACCEPTANCE.md](./MULTI_PROVIDER_ACCEPTANCE.md) |

See also: [GEMINI_WEB_API_PROVIDER.md](./GEMINI_WEB_API_PROVIDER.md), [GEMINI.md](./GEMINI.md), [BROWSER_COMPATIBILITY_AUDIT.md](./BROWSER_COMPATIBILITY_AUDIT.md).
