# Gemini Web API Worker

Localhost FastAPI bridge between NovelTrans Electron main process and
[`gemini_webapi`](https://github.com/HanaokaYuzu/Gemini-API).

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

## Security

- Binds `127.0.0.1` only
- Requires `X-NTS-Secret` header
- Never logs cookies or tokens
