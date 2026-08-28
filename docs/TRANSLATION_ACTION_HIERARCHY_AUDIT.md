# Translation Action Hierarchy Audit (Phase 6)

Audit date: 2026-08-29  
Scope: Translation Command Bar primary action hierarchy, toolbar order, responsive priority.

## Principle

| Tier | Actions | Placement |
|------|---------|-----------|
| High | Dịch tiếp, chapter prev/next, copy, export, save | Direct / split buttons |
| Medium | Translate current, next 3, context | Split menu / more |
| Low | Excel, focus, clear, retranslate, settings | ⋯ menu |

## Toolbar layout

### Left (identity + navigation)

```
←  Project ▼   ‹  Chương N ▼  ›   Language pair
```

- Chapter prev/next: direct `‹` `›` buttons (28px)
- Keyboard: `Alt+←` / `Alt+→` (also `Alt+↑` / `Alt+↓` legacy)

### Right (actions by frequency)

```
[save]  Copy ▼  Xuất ▼  [▶ Dịch tiếp ▼]  Bộ nhớ  ⋯
```

Save chip: spinner / brief check / error only — no permanent wide label.

## Primary CTA — Dịch tiếp

| Property | Value |
|----------|-------|
| Height | 36px |
| Padding | ~16px horizontal |
| Icon | Play (when actionable) |
| Class | `translation-action-split__main` |

Visibly larger than Copy/Export (sm secondary).

### Smart labels

| State | Label |
|-------|-------|
| Current untranslated | `Dịch chương {n}` |
| Current translated, next exists | `Dịch tiếp · {n}` |
| Job paused | `Tiếp tục` |
| Job running | `Đang dịch…` (disabled) |
| All translated | `Đã dịch xong` (disabled) |
| Fallback | `Dịch tiếp` |

Logic: `resolvePrimaryTranslateAction()` in `translation-primary-action.ts`.

## Split translate menu

- Dịch chương hiện tại
- Dịch 3 chương tiếp
- Dịch chương đã chọn ({count}) — when selection > 0
- Dịch theo phạm vi…
- Dịch phần còn lại
- ───
- Cài đặt dịch… → Settings

No inline worker/provider controls.

## Copy / Export

**Copy:** `[Copy]` copies translation; `[▼]` opens menu (source, bilingual).

**Export:** `[Xuất]` opens menu (no silent format); menu: TXT, DOCX, folder, change location.

Label uses `actions.export` → **Xuất** (not "Xuất dữ liệu").

## Memory chip

- Ghost style (`translation-memory-badge--ghost`)
- Brain icon + short label
- Click → toggle context panel (or AI memory route fallback)
- Responsive: label hidden first at ≤1366

## More menu (⋯)

- Excel/CSV
- Hiện ngữ cảnh
- Chế độ tập trung
- ───
- Dịch lại (danger)
- Xóa bản dịch (danger)

Removed from ⋯: prev/next chapter (now direct controls).

## Active job

- Primary CTA disabled while job running
- `TranslationJobStrip` under command bar (pause/resume)
- Split menu disabled during active job

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Dịch tiếp / continue |
| `Alt+←` | Previous chapter |
| `Alt+→` | Next chapter |
| `Alt+↑` / `Alt+↓` | Prev/next (legacy) |
| `Ctrl+Shift+F` | Focus mode |

## Responsive (≤1366)

Hide labels in order:

1. Memory text (icon remains)
2. Copy label → icon only
3. Export label → icon only

**Never hide** Dịch tiếp label. Min clickable size preserved.

## Test matrix

| Case | Status |
|------|--------|
| Smart label resolver | ✓ unit tests |
| Toolbar structure wiring | ✓ routing test |
| 1366 — Dịch tiếp visible | manual |
| 125/150% scaling overflow | manual |
| Screen reader primary action | `aria-label` on CTA |
| Split menu keyboard | native menu buttons |

## Files changed

- `TranslationCommandBar.tsx` — layout, chapter nav, copy/export split
- `TranslationActions.tsx` — primary CTA, smart label, menu
- `TranslationContextStatus.tsx` — ghost chip, context toggle
- `translation-primary-action.ts` — label resolver (new)
- `useTranslationEditorController.tsx` — shortcuts, new props
- `global.css`, `ui.css` — CTA sizing, split, responsive
- `en.ts`, `vi.ts` — new strings
- Tests + this audit doc

## Quality gate

```bash
npm run typecheck
npx vitest run tests/unit/translation/translation-primary-action.test.ts
npx vitest run tests/unit/routing/translation-workspace-wiring.test.ts
```
