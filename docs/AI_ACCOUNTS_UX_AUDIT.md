# AI Accounts UX Audit (Phase 4)

Unified **Tài khoản AI** center — Gemini, ChatGPT, Meta AI — without forced DB merge.

## Navigation

| Item | Status |
|------|--------|
| Sidebar label | `nav.accounts` → **Tài khoản AI** / **AI Accounts** (`AppShell.tsx`) |
| Icon | `CircleUser` |
| Route | `/accounts` (unchanged) |
| Deep link | `/accounts?provider=gemini\|chatgpt\|meta` |

## Page structure

Single page — no separate Google-only section header.

1. Title + subtitle + **+ Thêm tài khoản AI**
2. Cross-provider summary (ready / busy / paused / needs attention)
3. Provider filter tabs (when multi-provider)
4. Unified account list (`UnifiedAccountCard`)
5. Security note (no password storage)

## ViewModel layer

| File | Role |
|------|------|
| `src/renderer/features/accounts/ai-account-view-model.ts` | `AiAccountViewModel`, mappers from `GoogleAccountDto` + `AiAccountDto` |
| `src/renderer/features/accounts/use-ai-accounts.ts` | Loads all three sources in parallel |

No DB migration — unify at ViewModel only.

### AiAccountViewModel fields

- `id`, `providerId`, `providerType`, `providerKind`, `providerLabelKey`
- `displayName`, `subtitle`, `email`
- `statusLane` (aligned with Jobs page: ready / running / paused / login / attention / limited)
- `lastUsedAt`, `activeJob`, `planKey` (Gemini PRO etc.)
- `canPause`, `canDelete`, `profileDir`, `lastError` (advanced drawer only)
- `source` — discriminated union for actions

## Data sources

| Provider | Backend | IPC |
|----------|---------|-----|
| Gemini | `google_accounts` | `window.novelTrans.accounts.*` |
| ChatGPT | `ai_accounts` | `window.novelTrans.aiAccounts.*` |
| Meta AI | `ai_accounts` | `window.novelTrans.aiAccounts.*` |

Gemini Web API cookie accounts remain in Settings advanced (not shown on `/accounts`).

## Add account flow

1. **+ Thêm tài khoản AI** → provider picker dialog
2. **Gemini** → existing Google profile + browser login + verify (`AddGoogleAccountDialog`)
3. **ChatGPT / Meta** → create profile → open login → **Tôi đã đăng nhập** → `verifyBrowser`

No password storage. CAPTCHA/2FA handled in real browser — not bypassed.

## Normal UI hides

- Browser profile path (details advanced only)
- PID / lease (Google advanced only)
- Raw UUID (advanced drawer)
- Internal provider IDs

## Settings links

- `settings.aiManageAccounts` → `/accounts`
- Browser section → `/accounts`
- Primary provider panel → `/accounts?provider=gemini|chatgpt|meta` (browser providers only)
- `accountsRouteForProvider()` in `ai-account-view-model.ts`

Legacy key `aiManageGoogleAccounts` removed from UI strings.

## Phase 4 completion status

| Requirement | Status |
|-------------|--------|
| Sidebar **Tài khoản AI** + `CircleUser` | Done |
| Unified page title/subtitle/add button | Done |
| `AiAccountViewModel` layer (no DB merge) | Done |
| Cross-provider summary counts | Done |
| Provider filter + `?provider=` URL | Done |
| Unified account cards (Gemini/ChatGPT/Meta) | Done |
| Normal UI hides technical fields | Done |
| Add flow: provider picker → login → verify | Done |
| Actions menu (rename/pause/details/delete) | Done |
| Busy state with job context (Google) | Done |
| Details drawer + advanced toggle | Done (`showAdvancedTools`) |
| Settings deep links with provider filter | Done (primary provider panel) |
| Health labels aligned with Jobs | Done |
| Google + browser AI regression paths preserved | Manual QA pending |
| Browser AI busy overlay | Not done (backend gap) |

## Status labels

Unified via `AccountStatus` + `jobs.accountStatus.*` for Google lanes.

Browser AI maps:

| `AiAccountDto.status` | UI lane |
|-----------------------|---------|
| READY | ready |
| LOGIN_REQUIRED | login |
| DISABLED | paused |
| ERROR | attention |

Busy/running overlay uses Google `availability.activeJob` when present.

## Regression checklist

- [ ] Existing Google CRUD (add, login, pause, delete, plan)
- [ ] ChatGPT/Meta create, login, verify, rename, delete
- [ ] No data loss on page migration
- [ ] Settings links land on unified page
- [ ] Provider filter + URL param

## Not in scope

- Merging `google_accounts` + `ai_accounts` tables
- Gemini Web API account cards on `/accounts`
- Virtualized list (optional until 30+ accounts)
- Browser AI busy job overlay (needs backend availability on `ai_accounts`)

## Files changed (Phase 4)

- `src/renderer/pages/AccountsPage.tsx` — unified page
- `src/renderer/features/accounts/ai-account-view-model.ts`
- `src/renderer/features/accounts/use-ai-accounts.ts`
- `src/renderer/features/accounts/UnifiedAccountCard.tsx`
- `src/renderer/features/accounts/UnifiedAccountDetailsDrawer.tsx`
- `src/renderer/features/accounts/AddAiAccountDialog.tsx`
- `src/renderer/i18n/vi.ts`, `en.ts`
- `src/renderer/components/settings/AiSettingsPanel.tsx`
- `src/renderer/styles/global.css`

Legacy components kept for reference: `AccountRow`, `BrowserAiAccountSection`.
