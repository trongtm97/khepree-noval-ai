# Troubleshooting — Khepree Novel AI

## App won't start

- Confirm Windows 10/11 x64.  
- Delete only `cache/` under `%APPDATA%\KhepreeNovelAI` if corrupted — **do not** delete `data/` or `browser-profiles/` unless instructed.  
- Check `%APPDATA%\KhepreeNovelAI\logs\`.

## Login / session issues

- Accounts → Open browser → complete Google login manually (2FA/CAPTCHA supported by user).  
- Diagnostics → Test Browser Profile.  
- `LOGIN_REQUIRED` / `CAPTCHA` / `SESSION_EXPIRED` are non-retryable — fix in browser, then retry.

### Google: "This browser or app may not be secure"

Google blocks sign-in when Playwright’s bundled Chromium or automation flags are detected.

1. Install **Google Chrome** or **Microsoft Edge** (Stable).  
2. Close any leftover Khepree Novel AI / Chromium login windows.  
3. Accounts → **Open browser** again (app prefers Chrome → Edge with login-compat launch).  
4. Optional: set `NTS_BROWSER_ENGINE=CHROME` before `npm run dev` / starting the app.  
5. Do **not** use the OS default Chrome/Edge profile — Khepree Novel AI keeps a dedicated profile under `%APPDATA%\KhepreeNovelAI\browser-profiles\`.  

If Check session reports `BROWSER_NOT_SECURE`, fix the browser install / close old windows, then Open browser and retry sign-in.

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

- Upgrades keep `%APPDATA%\KhepreeNovelAI` (DB, profiles, settings).  
- Uninstall that removes AppData will wipe data — verify installer options.  
- After reinstall, run Test Browser Profile before large batches.

## Code signing / SmartScreen

Unsigned builds may show Windows SmartScreen. Sign via `WINDOWS_CERTIFICATE_*` env vars when releasing publicly.

## Khepree access

| Symptom | Fix |
|---------|-----|
| `AUTH_REQUIRED` / signed out | Khepree → Sign in |
| `ENTITLEMENT_MISSING` | Khepree → Plan → purchase or upgrade |
| `DEVICE_LIMIT_REACHED` | account.khepree.com → Devices → remove old device → **Retry Activation** |
| `DEVICE_REMOVED` | Remove device on account site if needed → **Retry Activation** |
| `DEVICE_BLOCKED` | Contact support — cannot reactivate locally |
| `ENTITLEMENT_SUSPENDED` / expired | Renew on account.khepree.com → **Refresh entitlement** |
| `OFFLINE_COLD_START` | Restore network — app does not bypass lease offline |
| Checkout stuck on waiting | Use **Check status**; payment must confirm via Khepree API (browser success URL alone is insufficient) |
| `CREDENTIAL_CORRUPT` | Sign out, clear Khepree secrets only if instructed — do not delete whole `data/` without backup |

OAuth uses system browser only — never enter Khepree password inside the app window.
