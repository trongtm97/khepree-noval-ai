# Playwright 1.49.x → 1.62.1 — Breaking-change audit

Target: **playwright@1.62.1** (current npm `latest` stable as of 2026-08-26). No alpha/beta.

## Relevant to NovelTrans

| Area | Impact | Action |
|------|--------|--------|
| `chrome` / `msedge` channels use new headless (since 1.49) | Affects **headless** channel launches only | App defaults **headed** for Gemini/Notebook; probes that set `headless:true` use new headless — acceptable |
| Bundled Chromium vs channel browsers | AUTO may drive Edge/Chrome Stable via `channel` | Dedicated `userDataDir` still NovelTrans profile — not OS default profile |
| Debian 11 / old OS drops | N/A on Windows desktop | None |
| API surface used here (`launchPersistentContext`, locators, `waitForTimeout`) | Still supported | No selector/API rewrite in this step |
| Node engines `>=20` on playwright package | Electron Forge main uses bundled Node | Monitor; install already resolves 1.62.1 |

## Non-goals this change

- No Gemini/Notebook selector edits
- No anti-detection by default
- No switch to user Chrome/Edge personal profiles
