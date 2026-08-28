# NovelTrans Studio — UI / UX

> Modern Windows desktop productivity UI. Dark-first. Vietnamese default.

Final renderer audit (checklist + debt): [`docs/UX_UI_FINAL_AUDIT.md`](./UX_UI_FINAL_AUDIT.md).

## Design philosophy

- Clarity over decoration
- Status always visible (top bar, AI panel, jobs workflow)
- Friendly Vietnamese copy; technical details behind accordion
- Reuse existing IPC / business logic — UI layer only

## Design tokens

Defined in [`src/renderer/styles/tokens.css`](../src/renderer/styles/tokens.css).

| Token | Dark |
|-------|------|
| `--bg-app` | `#0D0F12` |
| `--bg-sidebar` | `#111318` |
| `--bg-secondary` | `#16191F` |
| `--bg-elevated` | `#1B1F26` |
| `--border` | `rgba(255,255,255,0.07)` |
| `--text-primary` | `#F3F4F6` |
| `--accent` | `#7C8CFF` |

Themes: `dark` (default), `light`, `system` via `data-theme` + `theme-store`.

Density: `comfortable` | `compact` via `data-density`.

## Typography

System fonts: Segoe UI Variable / Segoe UI / system-ui. Mono for logs.

| Role | Size |
|------|------|
| Page title | ~22px semibold |
| Section | ~17px semibold |
| Body | 13–14px |
| Small / log | 12–13px |

## Layout

```
Title bar (32px drag)
Sidebar | Top bar
Sidebar | Main
Sidebar | Status bar
```

Sidebar nav (1A): Tổng quan, Dự án, Dịch truyện, Thuật ngữ, Nhân vật, Tài khoản Google, Tiến trình, Nhật ký, **Hướng dẫn**, Cài đặt.

Hidden from sidebar (deep-link): `/export`, `/learning`, `/diagnostics`, `/projects/:id/info`, `/projects/:id/source`. `/editor` redirects to `/translation`.

### Project metadata pages

| Route | Purpose |
|-------|---------|
| `/projects/:id/info` | Edit book metadata, list imported documents, sync `00_BOOK_PROFILE.md` |
| `/projects/:id/source` | Source folder path, scan stats, resync / import new chapters |

Context help: `project-info`, `source-file-types`. See [BOOK_METADATA.md](./BOOK_METADATA.md).

## Help Center

Route: `/help` and `/help/:articleId`.

Implementation: `src/renderer/features/help/` — typed article blocks, local search, setup checklist (live IPC state), related articles, version footer.

Context help: `?` on core pages, top-bar help icon, **F1** (route-aware), ErrorPanel **Tìm hiểu** → troubleshooting articles.

See [`docs/HELP_SYSTEM.md`](./HELP_SYSTEM.md).

## Components

Reusable primitives under `src/renderer/components/ui/` (Button, Dialog, Drawer, DataTable, LogViewer, EmptyState, ErrorPanel, StatusBadge, …).

Icons: **lucide-react** only.

## Notifications

Zustand store `notification-store` (persisted). Poll adapter `useSystemStatusPoll` diffs job/account state → SUCCESS / ERROR / ACTION_REQUIRED toasts; quieter events stay in center.

## Status colors

Use `StatusBadge` + icon/text (not color alone): ready/completed green, running accent, warning orange, error red, paused/waiting muted.

## Localization

Vietnamese-first UI (`vi.ts`). Settings tabs include **Dịch thuật** for global `default_target_language` (Language Picker, stacked international/native/code display). Create Project wizard: source `AUTO`, target from settings once on init (step navigation does not reset).

## Settings

`src/renderer/i18n/` — `vi.ts` default, `en.ts` stub same shape, `t()` / `useT()`, `status.ts`, `errors.ts` friendly map.

## Accessibility

Focus rings, icon-button `aria-label`, keyboard Ctrl+, → Settings, **F1** → Help (context), Ctrl+S/F in editor, Ctrl+F in Help search, `prefers-reduced-motion`.

## Responsive desktop

Min usable ~1366×768; sidebar collapses under 1366 unless pinned. Not a mobile app.

## Logs

Activity: derived from jobs/attempts. Technical: `logs:tail` IPC reads redacted `noveltrans.log`.
