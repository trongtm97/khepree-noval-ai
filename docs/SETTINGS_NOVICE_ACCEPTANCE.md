# Settings Novice Acceptance Test

Date: 2026-08-29  
Tester profile: first-time non-technical user (simulated)  
Scope: normal Settings tabs only — `general`, `language`, `translation`, `ai`, `storage`  
Out of scope: **Advanced** (technical controls intentionally isolated)

## Overall result: **PASS** (after acceptance fixes)

The novice scenario is completable on normal tabs without reading forbidden jargon. Three blockers were found during acceptance and fixed before sign-off (see [Fixes during acceptance](#fixes-during-acceptance)).

---

## Scenario walkthrough

| Step | Action | Result | Notes |
|------|--------|--------|-------|
| 1 | Open Settings | **PASS** | Sidebar → **Cài đặt** (1 click) |
| 2 | UI language VI → EN | **PASS** | UiLocalePicker: open + select English (2 clicks) |
| 3 | Default translation target → Japanese | **PASS** | LanguagePicker: open + select (2 clicks); auto-saved toast |
| 4 | Return UI language → Vietnamese | **PASS** | UiLocalePicker: open + select Tiếng Việt (2 clicks) |
| 5 | Translation mode **AUTO** | **PASS** | Segmented radio **Tự động — Khuyên dùng**; default is AUTO on fresh profile |
| 6 | Run **Kiểm tra & sửa tự động** (AI tab) | **PASS** | Primary button, 1 click; Google login only if accounts need it |
| 7 | Choose one storage root | **PASS** | **Thiết lập nơi lưu tự động** → OS folder picker → creates `Exports` + `Backups` |
| 8 | Close app | **PASS** | Standard window close |
| 9 | Restart app | **PASS** | Verified persistence paths (see below) |
| 10 | Verify choices persist | **PASS** | UI locale (localStorage), target language + AUTO + storage paths (SQLite `app_meta`) |

---

## Click budget

Counts are **in-app clicks** only (OS folder/login dialogs excluded).

| Flow | Target | Measured | Verdict |
|------|--------|----------|---------|
| Switch UI language (either direction) | ≤ 2 | 2 | **PASS** |
| Change default target language | picker + 1 selection | 2 | **PASS** |
| Optimize translation (**Tối ưu tự động**) | 1 | 1 | **PASS** |
| AI check & auto-fix | 1 (+ login if Google requires) | 1 | **PASS** |
| Choose storage root | 1 button + folder | 1 + OS | **PASS** |

**Full scenario (normal tabs, fresh Settings landing on General):**

| Action | Clicks |
|--------|--------|
| Open Settings (sidebar) | 1 |
| Open Language tab | 1 |
| VI → EN | 2 |
| Target → Japanese | 2 |
| UI → Vietnamese | 2 |
| Open Translation tab | 1 |
| AUTO (if not already selected) | 0–1 |
| Open AI tab | 1 |
| Kiểm tra & sửa tự động | 1 |
| Open Storage tab | 1 |
| Thiết lập nơi lưu tự động | 1 |
| **Total in-app** | **13–14** |

No redundant **Save** on safe settings — Language, Translation, General, Storage use auto-save toasts (`useSettingsFeedback`).

---

## Forbidden jargon audit (normal tabs)

User must **not** need to understand:

`provider priority` · `worker ID` · `perProviderMax` · cookie names · `Client ID` · OAuth · Drive · PID · Notebook grounding · correlation ID · JSON

| Tab | Visible forbidden terms | Verdict |
|-----|-------------------------|---------|
| General | None | **PASS** |
| Language | None | **PASS** |
| Translation | None (body copy fixed — see fixes) | **PASS** |
| AI | None on default success path (details hidden unless failed) | **PASS** |
| Storage | None on main surface; restore/advanced collapsed | **PASS** |
| Advanced (if opened) | Providers, cookies, probes, parallel — expected | N/A |

Automated guard: `tests/unit/settings/settings-novice-jargon.test.ts` — **PASS**

---

## Persistence (step 10)

| Setting | Store | Key / mechanism |
|---------|-------|-----------------|
| UI locale preference | Electron renderer `localStorage` | `khepree-novel-ai-locale` (Zustand persist) |
| Default target language | SQLite `app_meta` | `translation.defaultTargetLanguage` |
| Translation AUTO | SQLite scheduler policy | `globalMaxWorkers: 'AUTO'` |
| Storage root | SQLite `app_meta` | `export.defaultDirectory` + `backup.dir` via `setupStorageRoot` |

Restart reloads all of the above without a manual Save action.

---

## Fixes during acceptance

These were **not** new features — minimal fixes required to meet acceptance:

1. **IPC security audit** — App failed to start (`portability:setupStorageRoot` missing from audit). Added audit entries for `setupStorageRoot`, `checkStorageHealth`, `backupNow`, `runSystemHealth`, `autoSetupRun`, `autoSetupStatus`. Without this, step 7 and AI auto-setup could not work.
2. **Translation tab copy** — Removed visible `worker` / `provider` from `translationAutomationBody` (vi + en).
3. **AI tab disclosure** — Technical `Chi tiết` block now shows **only on failed** auto-setup, not after every successful run (prevents `workerInstalled`, `provider_*` leaking to curious users).

---

## Screenshots

Captured with `node scripts/settings-novice-screenshots.mjs` (single app instance, no other Khepree Novel AI running).

### 1366 × 768

| Tab | File |
|-----|------|
| Language | `docs/settings-novice-screenshots/1366x768/01-language-tab.png` |
| Translation | `docs/settings-novice-screenshots/1366x768/02-translation-tab.png` |
| AI | `docs/settings-novice-screenshots/1366x768/03-ai-tab.png` |
| Storage | `docs/settings-novice-screenshots/1366x768/04-storage-tab.png` |

### 1920 × 1080

| Tab | File |
|-----|------|
| Language | `docs/settings-novice-screenshots/1920x1080/01-language-tab.png` |
| Translation | `docs/settings-novice-screenshots/1920x1080/02-translation-tab.png` |
| AI | `docs/settings-novice-screenshots/1920x1080/03-ai-tab.png` |
| Storage | `docs/settings-novice-screenshots/1920x1080/04-storage-tab.png` |

At 1366px width Settings uses **side nav**; at 1920px width it uses **horizontal tabs** — both layouts shown above.

---

## Automation scripts

| Script | Purpose |
|--------|---------|
| `scripts/settings-novice-screenshots.mjs` | Screenshots at both resolutions (requires prior `npm run dev` build of main bundle) |
| `scripts/settings-novice-acceptance.mjs` | Full click walkthrough + persistence probe (Playwright Electron) |
| `tests/unit/settings/settings-novice-jargon.test.ts` | CI guard for forbidden copy on normal panels |

---

## Sign-off checklist

- [x] Normal user can complete 10-step scenario without Advanced tab
- [x] Click budgets met
- [x] No manual Save for safe settings
- [x] Forbidden jargon absent on normal tabs
- [x] Persistence mechanism verified
- [x] Screenshots at 1366×768 and 1920×1080
- [x] Startup blocker (IPC audit) resolved

**Settings novice acceptance: PASS**
