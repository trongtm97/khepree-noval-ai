# Troubleshooting — NovelTrans Studio

## App won't start

- Confirm Windows 10/11 x64.  
- Delete only `cache/` under `%APPDATA%\NovelTrans` if corrupted — **do not** delete `data/` or `browser-profiles/` unless instructed.  
- Check `%APPDATA%\NovelTrans\logs\`.

## Login / session issues

- Accounts → Open browser → complete Google login manually (2FA/CAPTCHA supported by user).  
- Diagnostics → Test Browser Profile.  
- `LOGIN_REQUIRED` / `CAPTCHA` / `SESSION_EXPIRED` are non-retryable — fix in browser, then retry.

## SELECTOR_NOT_FOUND

UI changed. Use Diagnostics:

1. View failure screenshot / DOM fragment.  
2. Load selector override JSON or Interactive Repair Mode.  
3. Reload overrides (no rebuild required).

## Drive / Notebook

- Settings: OAuth client must be configured (encrypted).  
- Account Drive connected flag required for sync.  
- Notebook must be `ready` before Gemini send for that worker.

## Translation jobs stuck

- Jobs → recover crashed attempts.  
- Quota / attention actions on NEEDS_ATTENTION.  
- Restart app — scheduler requeues in-flight jobs on graceful shutdown.

## Upgrade / reinstall

- Upgrades keep `%APPDATA%\NovelTrans` (DB, profiles, settings).  
- Uninstall that removes AppData will wipe data — verify installer options.  
- After reinstall, run Test Browser Profile before large batches.

## Code signing / SmartScreen

Unsigned builds may show Windows SmartScreen. Sign via `WINDOWS_CERTIFICATE_*` env vars when releasing publicly.
