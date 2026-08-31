# NovelTrans Studio

NovelTrans Studio is a Windows desktop application for AI-assisted multilingual novel translation.

## Core concepts

- **Automatic source-language detection** — script + AI-assisted catalog validation
- **User-selected target language** — per project / edition
- **Local-first SQLite knowledge/memory** — terms, characters, story state, jobs
- **Multiple translation editions** — same source, different target languages or styles
- **Gemini / ChatGPT / Meta AI provider support** — routed through one translation pipeline
- **Multi-account / concurrent translation** — per-provider browser profiles and worker scheduling
- **Optional Research Notebook** — NotebookLM grounding; not required for core translation
- **Local backups / export** — atomic DB backup, TXT / DOCX / EPUB export

**Version:** `0.1.0` (semantic versioning)

## Status

Phases 0–19 complete (scaffold → diagnostics). Multi-provider browser AI (ChatGPT, Meta AI) and UX passes through Phase 8 (browser compatibility) are **implemented in code** — see [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md).

**Not production-ready** for browser AI providers — live smoke required. **Khepree commercial licensing** targets production (`https://api.khepree.com`, `https://account.khepree.com`); mock acceptance PASS in CI — live cross-system verification still required before commercial ship. See [docs/KHEPREE_ACCEPTANCE.md](docs/KHEPREE_ACCEPTANCE.md) and [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

### Provider live-test gate

Do **not** claim ChatGPT, Meta AI, or Playwright Gemini paths are production-ready until live browser smoke passes:

```bash
# After manual login in Accounts
npx tsx scripts/browser-conversation-smoke.ts
npx tsx scripts/browser-conversation-smoke-report.ts
```

Gemini Google smoke (opt-in, separate suite):

```bash
copy google-smoke.config.example.json google-smoke.config.json
set NOVELTRANS_GOOGLE_SMOKE=1
npm run test:google-smoke
```

These suites are **opt-in** and are **not** part of default `npm test` / CI.

## Documentation

| Doc | Description |
|-----|-------------|
| [USER_GUIDE.md](docs/USER_GUIDE.md) | End-user workflows |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures |
| [RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | Manual QA before shipping |
| [MULTI_PROVIDER_ACCEPTANCE.md](docs/MULTI_PROVIDER_ACCEPTANCE.md) | Provider matrix (mock vs live) |
| [KHEPREE_ACCEPTANCE.md](docs/KHEPREE_ACCEPTANCE.md) | Khepree commercial E2E matrix (N09) |
| [KHEPREE_SECURITY.md](docs/KHEPREE_SECURITY.md) | Khepree licensing security boundary |
| [BROWSER_COMPATIBILITY_AUDIT.md](docs/BROWSER_COMPATIBILITY_AUDIT.md) | No stealth dependency |
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
| `browser-profiles/` | Per-account Chromium profiles (Google + AI browser accounts) |
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

**UNLICENSED** — no commercial licensing enforcement in the application yet. See [ARCHITECTURE.md](docs/ARCHITECTURE.md#4d-commercial-licensing).
