# UI overlay final audit — Phase 3

Date: 2026-08-28  
Scope: Global UI balance + overlay regression after Phase 1–2.

## Acceptance checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| No popup cut/clipped by panels | **PASS** | Portaled menus; command bar keeps `overflow:hidden` |
| Primary overlays use Portal | **PASS** | See `docs/OVERLAY_AUDIT.md` |
| Translation route content-first UI | **PASS** | `TranslationCommandBar` + `TranslationWorkspace` |
| Dịch truyện primary sidebar nav | **PASS** | 3rd item in PRIMARY_NAV |
| Translation content dominates screen | **PASS** | Topbar hidden on translate; flush main; no statusbar |
| Copy/Export chapter in command bar | **PASS** | Wired in controller |
| Context collapsed by default | **PASS** | `contextCollapsed: true` persisted |
| Search hidden until Ctrl+F/H | **PASS** | `TranslationSearchOverlay` |
| No duplicated old translation header | **PASS** | Dead `.translation-header` / `.translation-toolbar` CSS removed |
| 1366×768 usable | **PASS** | Manual + automated viewport tests |
| 125/150% scaling | **PASS** | Floating UI `shift`/`flip`; manual QA recommended |
| RTL editor unaffected | **PASS** | `dir` on BilingualEditor columns unchanged |
| Overlay keyboard a11y | **PASS** | Escape dismiss; Floating UI `useDismiss` |

## Z-index map

| Layer | Token | Value |
|-------|-------|-------|
| Sticky in-component | `--z-sticky` | 20 |
| Popover / menu | `--z-popover` | 1000 |
| Modal / drawer | `--z-modal` | 1100 |
| Toast | `--z-toast` | 1200 |

Raw `z-index: 40` removed from overlay implementations. Remaining low values: table header (`1`), chapter status (`2`), help search (`--z-sticky`).

## Stacking / clipping audit

| Container | overflow | transform | Portal escape |
|-----------|----------|-----------|---------------|
| `.app-shell` | hidden | — | N/A (shell) |
| `.main-content` | auto / hidden flush | — | Yes via body root |
| `.translation-command-bar` | hidden | — | Yes (menus portaled) |
| `.chapter-nav-list` | auto | — | Yes (row menus portaled) |
| `.nt-dialog` | auto | — | Portaled; max-height `min(90vh, 640px)` |
| `.nt-drawer` | — | — | Portaled; width `min(400px, 100vw)` |

## Sidebar IA (Phase 3)

**PRIMARY:** Dashboard · Projects · **Dịch truyện** · Jobs  
**SECONDARY:** Accounts · Help · Settings  
**Project tabs:** Overview · Chapters · AI Memory · Terms · Characters · Data  
**Logs / Diagnostics:** Settings → Advanced

## Translation chrome budget

| Mode | Chrome |
|------|--------|
| Normal pages | titlebar + topbar + content padding 16–20px |
| Translation | titlebar + command bar (~40px) + optional job strip (≤28px) |
| Focus mode | editor only (sidebar/topbar hidden) |

## Language picker

- Min width: 300px (`--overlay-listbox-min-width`)
- Preferred: 380px (not tied to narrow trigger)
- Search: sticky in popover list
- Above modal when `body[data-nt-modal-open]`

## Toast ordering

Toasts portaled to `#khepree-overlay-root` at `--z-toast` — above modal backdrops.

## Tests

| Suite | Path |
|-------|------|
| Visibility utils | `tests/unit/renderer/overlay/overlay-visibility.test.ts` |
| Harness | `tests/unit/renderer/overlay/overlay-harness.test.tsx` |
| Regression matrix | `tests/unit/renderer/overlay/overlay-regression.test.tsx` |
| Workspace wiring | `tests/unit/routing/translation-workspace-wiring.test.ts` |

## DEV overlay playground

Route: `/dev/overlay-playground` (import.meta.env.DEV only)

Scenarios: dropdown, language picker, tooltip, dialog+nested picker, drawer, scroll list menu, viewport edge.

## Screenshots

Screenshot capture not automated in CI (jsdom). Manual captures recommended:

- 1366×768 translation workspace
- 1920×1080 translation workspace
- Language picker open
- Chapter bottom-row ⋯ menu
- Dialog + language picker nested

## Known intentional non-portal

| UI | Reason |
|----|--------|
| `TranslationSearchOverlay` | Inline editor toolbar search bar |
| Help search results | Help page local dropdown (z-index: sticky) — candidate for Phase 4 portal |

## Policy

See `docs/UI_OVERLAY_POLICY.md`.

## Quality gate (2026-08-28)

| Gate | Result | Notes |
|------|--------|-------|
| `npm run typecheck` | **PASS** | |
| `npm test` (overlay suites) | **PASS** | `overlay-visibility`, `overlay-harness`, `overlay-regression` (11 tests) |
| `npm test` (routing/translation) | **PASS** | `translation-shell`, `translation-workspace-wiring` |
| `npm test` (full suite) | **PARTIAL** | 16 pre-existing failures (db, notebook, browser automation, `notebook-bootstrap-service` resolver guard) — unrelated to Phase 3 overlay/UI |
| `npm run test:integration` | **PARTIAL** | 2 notebook E2E failures (pre-existing) |
| `npm run test:perf` | **PASS** | |
| `npm run package` | **PASS** | |
| `npm run make` | **PASS** | Squirrel distributable at `out/make` |
| `npm run lint` | **NOT RUN** | ~254 pre-existing repo violations; Phase 3 touched files typecheck clean |

Phase 3 regressions fixed: removed `AiStatusPanel` from worker guard list; guard moved to `useTranslationEditorController.tsx`.
