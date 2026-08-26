# AI Provider Architecture

NovelTrans routes all model calls through **AI Provider Manager**. Translation Engine / job repair loop never import Playwright or `gemini_webapi` directly.

```
TranslationPack / BatchExecutor
        ↓
AiProviderManager (priority + optional fallback)
        ↓
   ┌────┴────┐
   ↓         ↓
Playwright  Gemini Web API
Gemini      (HTTP → Python worker)
```

## Provider types

| Type | Implementation | Notes |
|------|----------------|-------|
| `PLAYWRIGHT_GEMINI` | `PlaywrightGeminiAdapter` → `GeminiService` | Needs Notebook mapping |
| `GEMINI_WEB_API` | `GeminiWebApiProvider` → localhost FastAPI | Cookie session; no Notebook |
| `GEMINI_OFFICIAL` | Seeded `DISABLED` | Future |

## Interface (`IAIProvider`)

`initialize` · `healthCheck` · `sendPrompt(pack)` · `cancelRequest` · `getStatus` · `close` · optional `streamResponse`

Input: `TranslationPackDto` (same prompt as today).  
Output: `AIResponse` with status `SUCCESS` | `LOGIN_REQUIRED` | `SESSION_EXPIRED` | `RATE_LIMIT` | …

## Selection & fallback

- Ordered by `ai_providers.priority` among `enabled = 1`.
- Fallback (`app_meta` `ai.fallback.enabled`) only on configured statuses (default `RATE_LIMIT`, `SERVICE_UNAVAILABLE`) and only if `fallback_allowed`.
- Disabled providers never used.

## Database (migration 016)

- `ai_providers` · `ai_accounts` · `ai_models`
- Session cookies: `secrets` via `SecretKind: gemini_web_session` (safeStorage)

## Job wiring

`main.ts` injects:

```ts
sendInitial: (ctx) => aiProviders.manager.sendForJob(ctx)
sendRepair: (req) => aiProviders.manager.sendRepair(req)
```

Job states unchanged (`WAITING_AI` still applies).

See also: [GEMINI_WEB_API_PROVIDER.md](./GEMINI_WEB_API_PROVIDER.md), [GEMINI.md](./GEMINI.md).
