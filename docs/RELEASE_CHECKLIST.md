# Release Checklist — NovelTrans Studio

Mark each item **PASS** / **FAIL** / **NOT TESTED**.  
Do **not** call the build production-ready if any required item is FAIL or NOT TESTED.

Version under test: ________  
Build / installer: ________  
Date / tester: ________

## Status legend

| Label | Use when |
|-------|----------|
| **IMPLEMENTED** | Feature exists in code |
| **REAL TEST PASSED** | Verified manually or via live/opt-in smoke |

Browser providers (Gemini, ChatGPT, Meta AI) require **REAL TEST PASSED** live smoke — mock integration alone is insufficient.

## Automated gates

| Gate | Result | Notes |
|------|--------|-------|
| `npm run lint` | | |
| `npm run typecheck` | | |
| `npm test` (unit) | | |
| `npm run test:integration` | | Includes multi-provider mock matrix |
| `npm run test:perf` | | |
| `npm run test:google-smoke` (opt-in Real Google A–H) | | Gemini / Notebook — opt-in |
| Browser conversation smoke (ChatGPT / Meta / Gemini) | | `scripts/browser-conversation-smoke.ts` |
| `docs/MULTI_PROVIDER_ACCEPTANCE.md` live rows | | Must not be NOT_RUN for shipping |
| `npm run package` | | |
| `npm run make` (installer) | | |

> Unit + mock integration PASS does **not** unlock production-ready for browser providers.

## Manual product checklist

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | Fresh install | | |
| 2 | Add AI account (Google and/or ChatGPT/Meta) | | |
| 3 | Login Gemini (if used) | | Headed browser; dedicated profile |
| 4 | Login ChatGPT (if used) | | No Google required |
| 5 | Login Meta AI (if used) | | No Google required |
| 6 | Persistent session (restart keeps login) | | Per-provider profile |
| 7 | Import novel | | |
| 8 | Term match | | |
| 9 | Optional Research Notebook | | Skip allowed — local knowledge default |
| 10 | Translation job (each provider in use) | | Real send + parse |
| 11 | QA | | |
| 12 | Repair | | |
| 13 | Restart recovery / crash mid-send | | |
| 14 | Export | | |
| 15 | Backup | | |
| 16 | Restore | | |
| 17 | Multi-account concurrency | | |
| 18 | Quota / rate-limit handling | | |
| 19 | Uninstall/reinstall AppData preservation | | |

## Release blockers (must PASS for ship)

| Blocker | Result | Notes |
|---------|--------|-------|
| Real provider E2E (live browser send) | | |
| Send confirmation reliability | | |
| Response anchoring / extract | | |
| Crash recovery (all providers in use) | | |
| Code signing (if shipping signed build) | | Optional |
| Production auto-update server | | Placeholder OK for dev |
| Commercial licensing | | **NOT IMPLEMENTED** — N/A |

## Security spot-check

| Item | Result |
|------|--------|
| `nodeIntegration: false` | |
| `contextIsolation: true` | |
| IPC whitelist + Zod | |
| Navigation / external URL guards | |
| No cert/password in repo | |
| No CAPTCHA/2FA bypass automation | |

## Sign-off

Production-ready? **YES / NO**

Only YES if:

- All automated gates PASS
- Live browser smoke **REAL TEST PASSED** for every provider you ship
- All manual scenarios PASS
- No open BLOCKER items in [PROJECT_STATE.md](./PROJECT_STATE.md)
