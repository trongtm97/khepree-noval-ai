# UI overlay policy — Khepree Novel AI

## Rule

**All user-facing overlays MUST use the shared overlay system** (`src/renderer/components/overlay/`).

Applies to:

- menu
- listbox / combobox popover
- tooltip (when escaping scroll/overflow parents)
- dialog / alert
- drawer
- command palette (future)

## Required primitives

| Pattern | Component |
|---------|-----------|
| Anchored menu | `DropdownMenu` |
| Listbox / picker | `ListboxPopover` |
| Tooltip | `TooltipPopover` |
| Modal | `ModalPortal` / `Dialog` |
| Drawer | `DrawerPortal` / `Drawer` |

## Forbidden for global popups

```css
/* ❌ Do not add new overlay UIs like this */
.my-menu {
  position: absolute;
  z-index: 40;
}
```

```tsx
// ❌ Do not use contains() for dismiss after portal
rootRef.current.contains(event.target)
```

## Allowed exceptions (document in OVERLAY_AUDIT.md)

- **Inline toolbar overlays** that intentionally stay inside editor chrome (e.g. `TranslationSearchOverlay`)
- **Internal component layering** using `--z-sticky` inside a single widget (table header stickiness)

## Layer tokens (`tokens.css`)

| Token | Use |
|-------|-----|
| `--z-sticky` (20) | In-component sticky headers |
| `--z-popover` (1000) | Menus, pickers, tooltips |
| `--z-modal` (1100) | Dialog, drawer backdrop |
| `--z-toast` (1200) | Toast notifications |

Mount point: `#khepree-overlay-root` on `document.body`.

## Regression

- Automated: `tests/unit/renderer/overlay/*`
- Manual / DEV: `/dev/overlay-playground` (DEV builds only)
