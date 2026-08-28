# Google Accounts UX Audit

Date: 2026-08-29  
Scope: `AccountsPage` redesign — user-facing Google account management

## Before (production baseline)

| Issue | Detail |
|-------|--------|
| Duplicate status | `StatusBadge` + separate worker `Badge` both showed readiness |
| Duplicate plan | Badge, metadata row, and inline `Select` |
| Technical noise | Browser profile path, raw ISO `lastUsedAt`, worker state row |
| Permanent warning | `browserNotSecureHint` always visible |
| Control overload | 7+ buttons per card including permanent Delete |
| Inconsistent state | Page used `statusLabel(account.status)`; Jobs used `accountLaneStatus` |
| Feedback | Inline `banner banner-info` for routine success |
| No summary | No at-a-glance ready/busy/paused/attention counts |
| No search/filter | Same layout for 1 and 10+ accounts |

## After (this redesign)

### Architecture

```
AccountsPage (orchestration)
├── AccountsSummary
├── AccountRow
│   ├── AccountStatus
│   ├── AccountPrimaryActions
│   └── AccountActionsMenu
├── AddGoogleAccountDialog
├── EditGoogleAccountDialog
└── AccountDetailsDrawer
```

Shared logic: `src/renderer/features/accounts/account-ui-state.ts`

- `resolveAccountUiState()` — canonical single status (aligned with Jobs `accountLaneStatus`)
- `computeAccountSummary()` — summary strip counts
- `sortAccounts()` — problem accounts first
- `resolveAccountIdentity()` — no duplicate email lines
- `formatRelativeTime()` — friendly last-used labels

### Requirements checklist

| # | Requirement | Status |
|---|-------------|--------|
| I | Audit completed | Done — this document |
| II | Page answers 5 user questions | Done — summary + card status + primary CTA |
| III | Header copy updated | Done — subtitle without NotebookLM |
| IV | No permanent browser warning | Done — only on card error / advanced |
| V | Summary strip 60–72px | Done — `.accounts-summary` |
| VI | `resolveAccountUiState` | Done |
| VII | Compact row ~100–140px | Done — `.account-row` |
| VIII | Display name priority | Done — `resolveAccountIdentity` |
| IX | Single plan badge; edit via menu | Done |
| X | User-facing plan labels | Done — Free/Plus/Pro/Ultra/Chưa xác định |
| XI | Relative last used | Done — `formatRelativeTime` |
| XII | Profile path hidden by default | Done — Advanced drawer only |
| XIII | Profile lease when in use | Done — running state only |
| XIV | Assigned projects | Done — count + tooltip |
| XV | Current work when BUSY | Done — job title/chapters/progress |
| XVI | Context primary actions | Done — `AccountPrimaryActions` |
| XVII | Overflow menu | Done — `AccountActionsMenu` |
| XVIII | Notebook optional | Done — advanced tools only |
| XIX | No Google Drive | Done — no Drive UI added |
| XX | Notes in edit dialog | Done |
| XXI | Edit account dialog | Done — name/plan/notes |
| XXII | Guided add flow | Done — `AddGoogleAccountDialog` |
| XXIII | Email fallback deferred | Done |
| XXIV | Check connection tooltip | Done |
| XXV | Pause/resume wording | Done |
| XXVI | LIMITED explanation | Done |
| XXVII | NEEDS_ATTENTION reason | Done |
| XXVIII | Card-level errors | Done |
| XXIX | Toasts for routine ops | Done — `useNotificationStore` |
| XXX | Scales to many accounts | Done — compact rows |
| XXXI | Search/filter when >5 | Done |
| XXXII | Sort order | Done |
| XXXIII | Summary uses same resolver | Done |
| XXXIV | Jobs label alignment | Done — `jobs.accountStatus.*` |
| XXXV | Advanced details drawer | Done — `showAdvancedTools` |
| XXXVI | No secrets displayed | Done |
| XXXVII | Delete in overflow + confirm | Done; blocked when BUSY |
| XXXVIII | Empty state | Done + password reassurance |
| XXXIX | Responsive | Done — CSS breakpoint |
| XL | Dark UI | Done — existing tokens |
| XLI | Component refactor | Done |
| XLII | Tests | Done — `account-ui-state.test.ts` |
| XLIII | Quality gate | Pending CI run |

### Removed from normal card view

- Browser profile path
- Raw ISO timestamps
- Permanent plan `Select`
- Permanent Delete button
- Duplicate Ready badges
- Permanent `browserNotSecureHint` banner

### Provider architecture

No changes to `AccountWorkerService`, IPC channels, or `GoogleAccountDto` schema.

### Known limitations

1. **Open profile folder** — only Copy path in Advanced (managed-folder IPC does not expose arbitrary browser profile dirs).
2. **Notebook menu** — gated on `showAdvancedTools`, not a separate feature flag.
3. **Jobs deep-link filter** — navigates to `/jobs?account=…`; filter support depends on Jobs page query handling.

### Files touched

- `src/renderer/pages/AccountsPage.tsx`
- `src/renderer/features/accounts/*`
- `src/renderer/i18n/vi.ts`, `en.ts`
- `src/renderer/styles/global.css`
- `tests/unit/renderer/accounts/account-ui-state.test.ts`
- `docs/GOOGLE_ACCOUNTS_UX_AUDIT.md`
