# Gemini Web API Provider

Reverse-engineered web session bridge using [HanaokaYuzu/Gemini-API](https://github.com/HanaokaYuzu/Gemini-API) (`gemini_webapi`) behind a **localhost Python worker**.

## Architecture

```
Electron Main
  → GeminiWebApiProvider
    → WorkerProcessManager (spawn venv python)
      → workers/gemini_webapi_worker (FastAPI 127.0.0.1:18765)
        → gemini_webapi.GeminiClient
```

Electron never imports the Python package. Renderer never calls Gemini.

## Installation

1. Install **Python 3.11+** on the machine (Windows: official installer or `py -3`; Store stub `python` is not enough).
2. Settings → Nhà cung cấp AI → **Cài worker**  
   Creates `{userData}/data/gemini-webapi-venv` and `pip install -r workers/gemini_webapi_worker/requirements.txt`.
3. If Python missing: UI shows “Chưa cài thành phần Gemini Web API.” — app does not crash.

Bundled Python runtime is **not** in the installer yet (follow-up).

## Account / session

1. **Thêm tài khoản** → creates `ai_accounts` row + `{userData}/data/gemini-webapi-profiles/{id}/`.
2. Paste `__Secure-1PSID` (+ optional `__Secure-1PSIDTS`) from gemini.google.com DevTools.
3. Main encrypts JSON payload with `SecretStorageService` (`gemini_web_session:{accountId}`).
4. Worker `POST /gemini/session/init` receives plaintext **once in memory**, stores refresh cookies under `session_dir` (`GEMINI_COOKIE_PATH`).

Never store Google passwords. Never log cookies/tokens.

## HTTP API (worker)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/gemini/session/init` | Bind cookies to account |
| POST | `/gemini/chat` | `generate_content` |
| POST | `/gemini/cancel` | Best-effort cancel |
| GET | `/gemini/models` | List models for sync |

Auth: header `X-NTS-Secret` (random per worker process). Bind host forced to `127.0.0.1`.

### Chat response status

`SUCCESS` · `ERROR` · `LOGIN_REQUIRED` · `SESSION_EXPIRED` · `RATE_LIMIT` · `TIMEOUT` · `NETWORK_ERROR` · `SERVICE_UNAVAILABLE` · `UNKNOWN`

## Prompt compatibility

Provider sends `TranslationPack.prompt` as-is. Response parser / QA / repair loop unchanged (`<TRANSLATION>`, `<TERM_DELTA>`, `<MEMORY_DELTA>`).

## Models

Catalog in `ai_models` (Flash / Pro seeded). Sync from worker via `aiModels:sync` when session ready. Do not hardcode model enums from the deprecated library `Model` enum.

## Streaming

Interface allows optional `streamResponse`. v1 uses non-streaming `sendPrompt` only.

## Security

- Localhost only; middleware rejects non-loopback clients.
- Shared secret required on every request.
- Diagnostics / logs redact cookie-like strings.
- See [SECURITY.md](./SECURITY.md).

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Worker missing | Install Python 3.11+, Cài worker |
| LOGIN_REQUIRED | Paste fresh cookies |
| RATE_LIMIT | Wait or enable fallback to Browser provider |
| Worker crash | Restart app; manager restarts worker on next send |
| Concurrent accounts | Separate `session_location` per `ai_accounts.id` — never share |

## Limitations

- Unofficial web API — may break when Google changes endpoints.
- Still requires a Google worker in the job pool for scheduler claim (Web API send uses `ai_accounts`; Playwright profile lock remains for Browser path).
- No Official Gemini API in this provider.
