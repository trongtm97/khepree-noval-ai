# Settings UX Rework — Phase 1 Audit

Date: 2026-08-29  
Scope: Information architecture rework, General tab, shared settings primitives, message UX.

## Summary

Production route `/settings` now uses **6 tabs** (was 7). Old `?tab=` values redirect via client-side mapping. Sticky page-level success/error banners removed; auto-save uses toast; load failures use `ErrorPanel` per tab.

## Tab migration

| Legacy tab | New tab | Notes |
|------------|---------|-------|
| `appearance` | `general` | Theme + density only; advanced UI flags moved |
| `language` | `language` | Placeholder; Phase 2 |
| `translation` | `translation` | Unchanged route; panel primitives updated |
| `export` | `storage` | Export directory panel |
| `aiProviders` | `ai` | AiProvidersSettingsPanel |
| `aiDiagnostics` | `advanced` | AiDiagnosticsSettingsPanel under Advanced |
| `googleAi` (stale) | `ai` | Was invalid; now mapped |

### Visible labels

| Tab ID | Label |
|--------|-------|
| `general` | Chung |
| `language` | **Language** (product requirement — not localized) |
| `translation` | Dịch thuật |
| `ai` | AI |
| `storage` | Lưu trữ |
| `advanced` | Nâng cao |

Default tab: `general` (empty query string).

## Production callers updated

| File | Old link | New link |
|------|----------|----------|
| `AppShell.tsx` | `?tab=aiProviders` | `?tab=ai` |
| `ToastViewport.tsx` | `?tab=aiProviders` | `?tab=ai` |
| `help/content/operations.ts` | `?tab=export` | `?tab=storage` |
| `help/content/accounts.ts` | `?tab=googleAi` | `?tab=ai` |
| `JobsOverflowMenu.tsx` | `?tab=translation` | unchanged |
| `help/content/translation.ts` | `?tab=translation` | unchanged |

## New components

| Component | Path |
|-----------|------|
| `settings-tabs` | `src/renderer/components/settings/settings-tabs.ts` |
| `SettingsSection` | `src/renderer/components/settings/SettingsSection.tsx` |
| `SettingsRow` | `src/renderer/components/settings/SettingsRow.tsx` |
| `SettingsGroup` | `src/renderer/components/settings/SettingsGroup.tsx` |
| `SettingsStatus` | `src/renderer/components/settings/SettingsStatus.tsx` |
| `SettingsDisclosure` | `src/renderer/components/settings/SettingsDisclosure.tsx` |
| `SettingsNav` | `src/renderer/components/settings/SettingsNav.tsx` |
| `GeneralSettingsPanel` | `src/renderer/components/settings/GeneralSettingsPanel.tsx` |
| `AdvancedSettingsPanel` | `src/renderer/components/settings/AdvancedSettingsPanel.tsx` |
| `LanguageSettingsPanel` | `src/renderer/components/settings/LanguageSettingsPanel.tsx` |
| `useSettingsFeedback` | `src/renderer/components/settings/useSettingsFeedback.ts` |
| `SegmentedControl` | `src/renderer/components/ui/SegmentedControl.tsx` |

## General tab (Phase 1 complete)

- Theme: segmented control (System / Light / Dark), auto-save + toast
- Density: segmented control (Comfortable / Compact), auto-save + toast
- Recommended settings button: sets theme=system, density=comfortable, advancedTools=false, paragraphIds=false, concurrency=AUTO
- Does **not** change target language, export folders, accounts, projects

## Moved to Advanced

- `showAdvancedTools`
- `showParagraphIds`
- AI browser diagnostics (from former `aiDiagnostics` tab)
- Developer tool links, backup link, update check

## Message UX

| Before | After |
|--------|-------|
| Page-level `message` banner | Toast via `useNotificationStore` |
| Page-level `error` banner (sticky across tabs) | Tab-scoped `ErrorPanel` for load failures; inline `SettingsStatus` for section errors |
| Panel-local success banners | Toast or inline status |

## Navigation & layout

- Content max-width: `56rem` (~896px) in `.settings-content`
- Horizontal tabs when viewport > 1366px (no wrap, horizontal scroll if needed)
- Side navigation at ≤ 1366px (single column, no two-row tabs)
- Settings row pattern: label + description left, control right

## Auto-save

| Setting | Mechanism |
|---------|-----------|
| Theme | Zustand persist |
| Density | Zustand persist |
| Advanced tools / paragraph IDs | Zustand persist |
| Scheduler concurrency | IPC on change |
| Export directory | IPC on pick |
| AI provider toggles | IPC on action |
| Default target language | Explicit Save (Phase 3 will revisit) |

## Phase 2 — Language tab (2026-08-29)

### Language Center (`?tab=language`)

Three sections:

1. **Ngôn ngữ phần mềm** — `UiLocalePicker` (`system` | `vi` | `en`), auto-save, toast
2. **Ngôn ngữ dịch mặc định** — moved from Translation tab; `LanguagePicker` auto-save via IPC
3. **Ngôn ngữ nguồn** — read-only AUTO detection + help link

### Type separation

- `UiLocaleCode` / `UiLocalePreference` — `@shared/types/ui-locale.ts`
- `TranslationLanguageCode` — world catalog codes (alias `string`)
- `UI_LOCALE_CATALOG` — renderer-only; not `WORLD_LANGUAGE_CATALOG`

### System locale decision

Implemented `preference: 'system' | 'vi' | 'en'`. Resolves via `navigator.languages`; unsupported → `vi`. Persist key `khepree-novel-ai-locale` migrates legacy `{ locale: 'vi'|'en' }` → `{ preference }`.

### Removed

- Stale “chỉ hỗ trợ Tiếng Việt” message
- `TranslationSettingsPanel` (default target no longer on Translation tab)
- Save button for default target language

### Tests

- `tests/unit/i18n/ui-locale.test.ts`
- `tests/unit/settings/language-tab.test.ts`
- `tests/unit/i18n-ui.test.ts` — en `nav.*` / `settings.*` no Vietnamese diacritics

## Phase 3 — Translation tab (2026-08-29)

### Automatic-first UX

- **Chế độ dịch**: AUTO (default) | CUSTOM — radio cards, auto-save
- **AUTO**: human summary `maxConcurrent` only; hides `autoCap`, per-provider internals
- **CUSTOM**: concurrent jobs 1–8; Advanced disclosure (per-project, per-provider); Experimental nested disclosure (parallel same-story waves)
- **Tối ưu tự động** + **Khôi phục cài đặt dịch khuyên dùng** → `globalMaxWorkers=AUTO`, `perProjectMax=1`, `parallelTranslationWaves=false`
- **Editor section**: auto-advance after translate + font preset (sm/md/lg — includes line spacing via CSS)
- No default target language on this tab
- `SchedulerConcurrencyPanel` removed → `TranslationSettingsPanel`

### Tests

- `tests/unit/settings/translation-automation.test.ts`
- `tests/unit/settings/translation-settings-tab.test.ts`

## Phase 4 — AI tab (2026-08-29)

### Novice-first UX

- **Normal AI tab** (`AiSettingsPanel`): status snapshot, one-click **Kiểm tra & sửa tự động**, link to `/accounts`
- **`AiAutoSetupService`**: safe sequence (accounts → browser → worker install/start → recommended provider order → health checks); stops at login/2FA (no bypass)
- **Advanced → Nhà cung cấp AI**: provider priority, enable/disable, fallback, worker install
- **Advanced → Web API → Kết nối thủ công**: cookie paste with warning (never shows saved values)
- **Advanced → Chẩn đoán AI**: six browser probes (unchanged)
- Removed duplicate account CRUD from Settings; canonical `/accounts` only
- IPC: `ai:autoSetupRun`, `ai:autoSetupStatus`

### Tests

- `tests/unit/ai/ai-auto-setup.test.ts`
- `tests/unit/settings/ai-settings-tab.test.ts`

## Phase 5 — Storage tab (2026-08-29)

### Export / backup unified UX

- **`StorageSettingsPanel`** replaces bare `ExportSettingsPanel` on **Lưu trữ** tab
- Sections: **Nơi lưu bản dịch**, **Sao lưu tự động**, **Dữ liệu ứng dụng**
- One-click **Thiết lập nơi lưu tự động** → `{root}/Exports` + `{root}/Backups` (separate meta keys)
- Export path row with ellipsis + tooltip; **Đổi** / **Mở thư mục**
- Auto backup ON by default; **Sao lưu ngay**; friendly last-backup line
- Retention 7/4/3 hidden in Advanced disclosure
- Custom backup folder in Advanced only
- **Kiểm tra nơi lưu** health check IPC
- Restore under collapsed Advanced with preview + confirm
- **Mở thư mục dữ liệu** via `app:openFolder('root')`
- Removed Advanced → `/export` backup link (canonical: Settings → Lưu trữ)

### Tests

- `tests/unit/portability/storage-setup.test.ts`
- `tests/unit/settings/storage-settings-tab.test.ts`

## Remaining phases

| Phase | Tab | Status |
|-------|-----|--------|
| 2 | Language | **Done (Phase 2)** |
| 3 | Translation | **Done (Phase 3)** |
| 4 | AI | **Done (Phase 4)** |
| 5 | Storage | **Done (Phase 5)** — export + backup unified |
| 6 | Advanced | **Done (Phase 6)** — consolidated technical controls + stale cleanup |

## Pre-rework problems addressed (Phase 1)

- [x] 7-tab technical IA replaced
- [x] Appearance advanced flags moved out of General
- [x] Sticky banners removed from SettingsPage
- [x] Legacy deep links mapped
- [x] Shared settings row components
- [x] Responsive nav without tab wrap
- [x] Language tab functional (Phase 2)
- [x] AI tab novice-friendly (Phase 4)
- [x] Storage + backup unified (Phase 5)

## Backend

No duplicate backend. All panels reuse existing IPC:
- `translationSettings.*`, `jobs.*`, `portability.*` (incl. `setupStorageRoot`, `checkStorageHealth`, `backupNow`), `aiProviders.*`, `aiAccounts.*`, `diagnostics.*`, `checkForUpdates`, `app.openFolder`
