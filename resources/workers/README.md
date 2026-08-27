# Packaged Gemini Web API worker (Windows)

Production ships `NovelTransGeminiWorker.exe` here (PyInstaller one-file).

Build on a Windows machine with Python 3.11+:

```bash
npm run build:gemini-worker
```

Forge `extraResource` copies this folder into the app `resources/workers/`.

Do **not** put here:
- `.venv`, `__pycache__`, `.env`, cookies, PSID secrets
- Python source (dev uses `workers/gemini_webapi_worker/`)

If this exe is missing at package time, the installer still works; Gemini Browser (Edge/Chrome) remains available and Web API is optional.
