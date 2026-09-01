# Gemini Web API Worker

Localhost bridge between NovelTrans Electron main process and
[`gemini-web2api`](https://github.com/Sophomoresty/gemini-web2api).

Replaces the previous HanaokaYuzu/Gemini-API (`gemini_webapi`) stack.

## Production (Windows packaged)

Build a standalone exe on the **build machine** (end users need no Python):

```bash
npm run build:gemini-worker
```

Output: `resources/workers/NovelTransGeminiWorker.exe` (copied into the installer via Forge `extraResource`).

See `docs/WINDOWS_RUNTIME_DEPENDENCIES.md`.

## Run (dev)

```bash
cd workers/gemini_webapi_worker
python -m venv .venv
# Windows:
.venv\Scripts\pip install -r requirements.txt
set NTS_GEMINI_WORKER_SECRET=dev-secret
set NTS_GEMINI_WORKER_PORT=18765
.venv\Scripts\python main.py
```

NovelTrans normally creates the venv under userData and spawns this process.

## Third party

- `gemini_web2api.py` — vendored from [Sophomoresty/gemini-web2api](https://github.com/Sophomoresty/gemini-web2api) (MIT)

## Security

- Binds `127.0.0.1` only
- Requires `X-NTS-Secret` header on NovelTrans endpoints; `/v1/*` uses Bearer with the same secret
- Never logs cookies or tokens
