# Overlay audit — Khepree Novel AI Phase 1

Central overlay system: `#khepree-overlay-root` + `@floating-ui/react` + `createPortal`.

Layer tokens (`tokens.css`):

| Token | Value |
|-------|-------|
| `--z-sticky` | 20 |
| `--z-popover` | 1000 |
| `--z-modal` | 1100 |
| `--z-toast` | 1200 |
| `--z-dropdown` | alias → `--z-popover` |

## Primitives

| Primitive | Path | Portal | Floating UI |
|-----------|------|--------|-------------|
| OverlayPortal | `src/renderer/components/overlay/OverlayPortal.tsx` | Yes | — |
| AnchoredPopover | `src/renderer/components/overlay/AnchoredPopover.tsx` | Yes | via hook |
| DropdownMenu | `src/renderer/components/overlay/DropdownMenu.tsx` | Yes | Yes |
| ListboxPopover | `src/renderer/components/overlay/ListboxPopover.tsx` | Yes | Yes |
| TooltipPopover | `src/renderer/components/overlay/TooltipPopover.tsx` | Yes | Yes |
| ModalPortal | `src/renderer/components/overlay/ModalPortal.tsx` | Yes | — |
| DrawerPortal | `src/renderer/components/overlay/DrawerPortal.tsx` | Yes | — |

## User-facing overlays

| Overlay | Before | Clipping ancestor | After | Portal | Floating | Test |
|---------|--------|-------------------|-------|--------|----------|------|
| LanguagePicker menu | `position:absolute` in `.language-picker` | parent overflow, dialogs | `ListboxPopover` | Yes | Yes | `overlay-harness` |
| TranslationCommandBar — project | `__menu` absolute | `.translation-command-bar { overflow:hidden }` | `ListboxPopover` | Yes | Yes | manual |
| TranslationCommandBar — chapter | `__menu` absolute | command bar + identity overflow | `ListboxPopover` | Yes | Yes | manual |
| TranslationCommandBar — copy/export/more | `__menu` absolute | command bar overflow | `DropdownMenu` | Yes | Yes | manual |
| TranslationActions — Dịch tiếp | `.translation-menu` absolute | command bar | `DropdownMenu` | Yes | Yes | manual |
| ChapterNavigator — header ⋯ | `.translation-menu` absolute | `.chapter-nav-list` scroll | `DropdownMenu` | Yes | Yes | `overlay-harness` |
| ChapterNavigator — row ⋯ | `.translation-menu` absolute | `.chapter-nav-list` scroll | `DropdownMenu` per row | Yes | Yes | `overlay-harness` |
| SwitchTranslationControl | `.switch-translation-menu` absolute | topbar / cards | `DropdownMenu` | Yes | Yes | manual |
| EditionSwitcher | uses `LanguagePicker` | same as picker | inherited | Yes | Yes | manual |
| Dialog (`ui/Dialog`) | inline in React tree | any ancestor overflow | `ModalPortal` | Yes | — | `overlay-harness` |
| Drawer (`ui/Drawer`) | inline siblings | shell layout | `DrawerPortal` | Yes | — | manual |
| Tooltip (`.nt-tooltip__tip`) | absolute in parent | scroll rails | `TooltipPopover` primitive ready; no call sites yet | Yes | Yes | — |
| DataImportWizard dialog | inline `nt-dialog-backdrop` | page scroll | `ModalPortal` | Yes | — | manual |
| ProjectDataPage report dialog | inline `nt-dialog-backdrop` | page scroll | `ModalPortal` | Yes | — | manual |
| TranslationSearchOverlay | `position:absolute` in editor | editor panel | intentional inline toolbar overlay | No | No | — |

## Outside-click fix

Removed `rootRef.current.contains(event.target)` patterns. Dismiss via Floating UI `useDismiss` on portaled menus.

## Tests

- `tests/unit/renderer/overlay/overlay-visibility.test.ts` — viewport / size / clipping assertions
- `tests/unit/renderer/overlay/overlay-harness.test.tsx` — overflow:hidden, overflow:auto last row, modal portal

Scenarios covered in harness: (1) overflow hidden, (2) overflow auto last row, (7) modal portal. Remaining viewport-edge cases (4–6, 8–12) rely on Floating UI `flip`/`shift` middleware + manual QA at 1366×768, 1920×1080, 125%/150% scaling.

## Notes

- `translation-command-bar` keeps `overflow:hidden` for toolbar layout; menus no longer render inside it.
- Popovers above open modals: `body[data-nt-modal-open]` bumps popover z-index to `calc(var(--z-modal) + 2)`.
- Screenshot tests not added — vitest/jsdom has no visual capture in CI.
