# UX / UI Final Audit — NovelTrans Studio Renderer

> Professional Windows desktop · **dark-first** · Vietnamese default · compact but readable.  
> Audit date: 2026-08-27 · Scope: `src/renderer` (+ shared channel labels).

Companion design notes: [`docs/UI_UX.md`](./UI_UX.md).

---

## Goals (acceptance)

| # | Goal | Status |
|---|------|--------|
| 1 | Remove repeated inline styles → reusable classes/tokens | **Partial** — tokens + `.u-*` utilities shipped; high-debt pages still have inline leftovers |
| 2 | Normalize spacing / radius / fonts / control heights / card pad / table density / badges | **Done** (token layer) |
| 3 | Max one primary CTA per screen | **Partial** — fixed hot spots; TranslationToolbar split-primary intentional |
| 4 | Status = icon/dot + text (not color alone) | **Partial** — `StatusBadge` / status-dot pattern; more pages should migrate |
| 5 | Empty states guide action | **Partial** — `EmptyState` exists; several still lack `actionLabel` |
| 6 | Errors: human Vietnamese first, technical collapsed | **Partial** — `ErrorPanel` + `friendlyError`; many banners still dump `err.message` |
| 7 | No raw enums for normal users | **Improved** — `statusLabel` never returns raw codes; key surfaces fixed |
| 8 | Technical names only in Advanced | **Improved** — AI Memory / providers; Settings Advanced still intentional |
| 9 | Keyboard / focus / a11y | **Baseline OK** — F1, Ctrl+, Ctrl+F/S (scoped); `:focus-visible` + `--focus-ring` |
| 10 | i18n lint — no stray user English (except tech names) | **Tool added** — `npm run lint:i18n` |
| 11 | Resolve test 1366×768 / 1920×1080 / 2560×1440 | **Manual checklist** (below) |
| 12 | Do not break list virtualization | **Preserved** — editor + log virtual windows untouched |
| 13 | This document | **Done** |

---

## What shipped in this pass

### Design tokens (`tokens.css`)

New / clarified:

- `--btn-height`, `--btn-height-sm`, `--input-height`, `--icon-btn-size`
- `--pad-card`, `--pad-banner`, `--gap-inline|stack|section`
- `--table-cell-y|x`, `--line-height-body`
- Compact density overrides tied to `[data-density='compact']`

### Primitives (`ui.css`)

- Buttons / inputs use control height tokens + `:focus-visible` → `--focus-ring`
- Cards use `--pad-card`; tables use density cell padding
- `ErrorPanel` title/desc/actions classes (no inline styles)
- Layout utilities: `.u-stack`, `.u-row`, `.u-mt-*`, `.u-mono`, `.u-text-sm`, `.u-reset-list`, `.u-ghost-btn`, `.u-pad-compact`

### Status / enums

- `statusLabel()` expanded (bootstrap, sync, source, assisted…) and **never** falls back to raw enum text
- Fixed raw badges: Characters, Setup wizard, AI providers panel, AI Memory bootstrap
- Provider type shown as tech product name (`Gemini Notebook`), not `PLAYWRIGHT_GEMINI`
- Pack-mode channel labels no longer expose `hybrid` / `slim` / `fat-pack` strings

### Primary CTA

- Projects: card **Open** → secondary (header **Create** stays primary)
- Accounts: **Connect Drive** → secondary (header **Add account** stays primary)
- AI Memory: error `ErrorPanel` owns the single primary; Sync demotes while error/assisted active
- AI providers: Connect demotes while worker-install primary is showing

### i18n

- New status strings (vi + en)
- Script: `npm run lint:i18n` → `scripts/check-i18n.mjs`

---

## Remaining debt (prioritized)

### P0 — user-facing quality

1. **Migrate error banners → `ErrorPanel` + `friendlyError`** on: Translation editor, Projects, Portability, Learning, Project source/info, Dashboard.
2. **EmptyState CTAs** for Jobs / Terms review / Characters / Dashboard “no jobs” sections.
3. **JobsPage inline-style debt** (~35 `style={{}}`) → `.u-*` / page CSS.

### P1 — consistency

4. Finish demoting competing primaries (Settings OAuth guide vs Save; Project source Sync vs Confirm).
5. Chapter navigator + Terms/Jobs tables: consider virtualization only if projects exceed ~2k rows (do **not** change editor/log virtualization).
6. Replace leftover English confirms (`ProjectsPage` restore) with i18n keys.

### P2 — polish

7. Sweep remaining inline styles in Settings / Portability / AppShell.
8. Ensure every `Badge` status uses status-dot + label (not color-only).

---

## Keyboard & accessibility baseline

| Shortcut | Where | Notes |
|----------|-------|-------|
| **F1** | Global (`AppShell`) | Contextual help article |
| **Ctrl+,** | Global | Settings |
| **Ctrl+F** | Translation editor · Help | Editor search / help search |
| **Ctrl+S** | Translation editor | Save |
| Focus | Global `:focus-visible` | `--focus-ring`; buttons/inputs wired |

**Still verify manually:** tab order on Create Project wizard, AI Memory disclosure toggles, job drawer.

---

## Virtualization (do not regress)

| List | Implementation | Rule |
|------|----------------|------|
| Editor paragraphs | `EditorVirtualList` + fixed row height | Do not change height math without scroll/search retest |
| Logs | `LogViewer` fixed row height | Same |
| Chapters / terms / jobs | Not virtualized today | OK for typical novels; add virtualization later without touching editor/log |

---

## Screenshot checklist

Run app dark theme, Vietnamese locale, density comfortable then compact.

### Resolutions

- [ ] **1366×768** — sidebar usable; no horizontal scroll on Dashboard / Translate / Jobs
- [ ] **1920×1080** — primary layout reference
- [ ] **2560×1440** — content max-width readable (AI Memory ~42rem); no sparse “floating” cards

### Screens (capture each at 1920×1080)

| # | Screen | Check |
|---|--------|-------|
| 1 | Setup wizard | Status badges Vietnamese; one primary per step |
| 2 | Dashboard / Command Center | Next-up CTA clear; empty sections actionable or intentionally quiet |
| 3 | Projects list | One primary (**Tạo dự án**); cards secondary |
| 4 | Project workspace tabs | Compact tab bar; focus ring visible |
| 5 | Translation editor | Ctrl+F / Ctrl+S; context status not raw enum; job progress honest |
| 6 | AI Memory default | Friendly status; no 00–08 list; Advanced collapsed |
| 7 | AI Memory error/stale | Human VI copy; technical in details; one primary CTA |
| 8 | Terms | Empty + filtered empty; status labels mapped |
| 9 | Characters | Status dot + VI label (not `active`) |
| 10 | Accounts | Header primary only; Drive connect secondary |
| 11 | Jobs | StatusBadge text; drawer error uses friendly copy |
| 12 | Logs | Virtual list scroll smooth; empty technical tab has folder CTA |
| 13 | Settings → Google AI | No `PLAYWRIGHT_GEMINI` raw; one primary when worker missing |
| 14 | Help (F1) | Opens related article; Ctrl+F focuses search |

### Capture tips (Electron)

If environment supports screenshots:

```text
1. npm run start
2. Resize window to target resolution (or OS display scale 100%)
3. Win+Shift+S or Snipping Tool → save under docs/screenshots/ux-audit/
4. Name: {screen}-{width}x{height}.png
```

Folder `docs/screenshots/ux-audit/` is optional — create when capturing.

---

## Commands

```bash
npm run lint:i18n
npm run typecheck
npm run lint
```

---

## Out of scope / non-goals

- Redesigning help article content
- Changing Notebook / sync business logic
- Rewriting JobsPage entirely in one PR
- Light-theme pixel polish beyond token parity
