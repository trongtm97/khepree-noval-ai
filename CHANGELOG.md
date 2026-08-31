# Changelog

All notable changes to NovelTrans Studio are documented here.  
Format inspired by [Keep a Changelog](https://keepachangelog.com/). Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added — Khepree commercial integration (N01–N09)

- Khepree OAuth login, device activation, signed lease verification, heartbeat runtime
- Khepree hub UI: Account, Plan, Devices, About (VI/EN)
- In-app plan catalog, checkout via system browser, entitlement polling (no redirect-trust)
- Product access boundary on protected IPC and jobs
- Security hardening: log redaction, URL validation, renderer secret exclusion
- Cross-system acceptance integration test (`tests/integration/khepree-cross-system-acceptance.test.ts`)
- Docs: `KHEPREE_ACCEPTANCE.md`, `KHEPREE_SECURITY.md`, updated USER_GUIDE / ARCHITECTURE / RELEASE_CHECKLIST

### Known gaps (Khepree)

- Production lease signing key not configured in repo
- Staging/live Khepree cross-system matrix NOT RUN
- Browser AI live smoke still NOT RUN (separate gate)

## [0.1.0] — 2026-08-23

### Added

- Windows packaging via Electron Forge + Squirrel installer (`NovelTransStudioSetup.exe`)
- First-run setup wizard (welcome → storage → account → Drive optional → import → notebook → Gemini test → ready)
- Code signing configuration via `WINDOWS_CERTIFICATE_*` environment variables (no certs in repo)
- Update provider abstraction + honest manual placeholder (no fake update server)
- Main-process crash handlers; renderer error boundary reload; browser worker recovery hook
- Window navigation / external URL / webview restrictions
- Performance scale tests (100k terms, 2000 chapters × 3 projects)
- Integration smoke test (setup + project + backup)
- Docs: USER_GUIDE, TROUBLESHOOTING, RELEASE_CHECKLIST; refreshed README

### Prior phases (summary)

- Phases 0–15: scaffold, DB, security, accounts, import, terms, memory, packs, Drive, Notebook, Gemini, jobs, scheduler
- Phase 16: Learning pipeline
- Phase 17: Translation editor
- Phase 18: Data portability
- Phase 19: Automation diagnostics + selector overrides

### Known gaps

- Production Gemini `sendInitial` / SYSTEM_TERM_FIX automation still outstanding (Phase 20+)
- Manual RELEASE_CHECKLIST scenarios require human QA on a Windows machine
- Auto-update CDN not configured (placeholder provider only)
