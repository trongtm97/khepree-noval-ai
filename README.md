# NovelTrans Studio

Desktop Windows (10/11 x64) app for **multilingual novel translation**: detected source language, target translation editions, local-first project memory, and Gemini via Web API or browser automation with your own Google accounts. **Research Notebook** (NotebookLM) is optional—not required for core translation.

**Version:** `0.1.0` (semantic versioning)

## Status

Phases 0–19 complete (scaffold → diagnostics). See [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md).

This tree includes the **Windows production packaging** pass (Forge installer, first-run wizard, crash handlers, update provider abstraction). Treat as **release candidate** until [RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) items are marked PASS.

### Playwright / Gemini browser — not production-ready by default

Do **not** claim the Playwright Gemini browser path is production-ready unless [docs/REAL_GOOGLE_TEST_REPORT.md](docs/REAL_GOOGLE_TEST_REPORT.md) shows **Overall = PASS** for scenarios A–H.

```bash
copy google-smoke.config.example.json google-smoke.config.json
# profilePath = logged-in NovelTrans browser profile
# notebookUrl = dedicated SMOKE notebook (never a production novel)
set NOVELTRANS_GOOGLE_SMOKE=1
npm run test:google-smoke
```

Or: **Settings → Advanced → Diagnostics** or Developer Diagnostics → **Run Real Google Smoke**.  
This suite is **opt-in** and is **not** part of default `npm test` / CI.

## Documentation

| Doc | Description |
|-----|-------------|
| [USER_GUIDE.md](docs/USER_GUIDE.md) | End-user workflows |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures |
| [RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | Manual QA before shipping |
| [REAL_GOOGLE_TEST_REPORT.md](docs/REAL_GOOGLE_TEST_REPORT.md) | Real Google smoke A–H gate |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design |
| [SECURITY.md](docs/SECURITY.md) | Secrets, IPC, Electron hardening |
| [AUTOMATION.md](docs/AUTOMATION.md) | Browser runner |
| [PORTABILITY.md](docs/PORTABILITY.md) | Export / backup |
| [DIAGNOSTICS.md](docs/DIAGNOSTICS.md) | Automation diagnostics |
| [PROJECT_STATE.md](docs/PROJECT_STATE.md) | Phase tracker |

## Data location (survives upgrades)

All user data lives under:

`%APPDATA%\NovelTrans\`

| Path | Contents |
|------|----------|
| `data/` | SQLite database + settings (`app_meta`) |
| `browser-profiles/` | Per-account Chromium profiles |
| `backups/` | DB / archive backups |
| `exports/` | Novel + diagnostics exports |
| `logs/` | App logs |
| `cache/` | Automation diagnostics cache |

Installer upgrades **must not** delete this folder. Reinstall preserves DB, profiles, and settings when AppData is left intact.

## Development

```bash
npm install
npm start                 # Electron dev
npm run typecheck
npm run lint
npm test                  # Unit (+ integration via include; perf excluded)
npm run test:integration
npm run test:perf         # 100k terms + 2000×3 chapters (slow)
npm run test:google-smoke # Real Google A–H (opt-in; set NOVELTRANS_GOOGLE_SMOKE=1)
npm run package           # Unpackaged build
npm run make              # Windows Squirrel installer
```

### Code signing (optional)

Set env vars — never commit certificates or passwords:

```bash
set WINDOWS_CERTIFICATE_FILE=C:\path\to\cert.pfx
set WINDOWS_CERTIFICATE_PASSWORD=...
rem or:
set WINDOWS_CERTIFICATE_SUBJECT_NAME=Your Cert Subject
npm run make
```

### Auto update

Provider abstraction in `src/main/updates/`. Default: **ManualPlaceholderUpdateProvider** (honest “no production update server”). Settings → Check for Updates uses it. Do not fake a CDN.

## Tech stack

Electron · TypeScript · React · Vite · Electron Forge (Squirrel) · Playwright · SQLite · Zod · Zustand

## License

UNLICENSED — commercial project.
