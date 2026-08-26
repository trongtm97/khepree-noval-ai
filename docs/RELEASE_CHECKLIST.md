# Release Checklist — NovelTrans Studio

Mark each item **PASS** / **FAIL** / **NOT TESTED**.  
Do **not** call the build production-ready if any required item is FAIL or NOT TESTED.

Version under test: ________  
Build / installer: ________  
Date / tester: ________

## Automated gates

| Gate | Result | Notes |
|------|--------|-------|
| `npm run lint` | | |
| `npm run typecheck` | | |
| `npm test` (unit) | | |
| `npm run test:integration` | | |
| `npm run test:perf` | | |
| `npm run package` | | |
| `npm run make` (installer) | | |

## Manual product checklist

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | Fresh install | | |
| 2 | Add account | | |
| 3 | Login Gemini | | |
| 4 | Persistent account (restart keeps session) | | |
| 5 | Import novel | | |
| 6 | Term match | | |
| 7 | Drive | | |
| 8 | Notebook | | |
| 9 | Translation | | |
| 10 | QA | | |
| 11 | Repair | | |
| 12 | Restart recovery | | |
| 13 | Export | | |
| 14 | Backup | | |
| 15 | Restore | | |
| 16 | Multi-account | | |
| 17 | Quota detection | | |
| 18 | Uninstall/reinstall AppData preservation | | |

## Security spot-check

| Item | Result |
|------|--------|
| `nodeIntegration: false` | |
| `contextIsolation: true` | |
| IPC whitelist + Zod | |
| Navigation / external URL guards | |
| No cert/password in repo | |

## Sign-off

Production-ready? **YES / NO**

Only YES if all automated gates PASS and all 18 manual scenarios PASS.
