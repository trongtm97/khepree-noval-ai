# Translation Daily Productivity Audit (Phase 7)

Scope: high-volume translation workflow — editor productivity, navigation safety, feedback, focus mode.

## Delivered

| Area | Change |
|------|--------|
| Chapter summary | Column headers show source/target language labels only; title row extracted when present |
| Title row | `EditorTitleRow` — distinct styling, smaller height, source \| target |
| Paragraph toolbar | Hover/active `⋯` menu — retranslate, copy, lock (disabled), version history |
| Active row | Softer inset highlight (reduced accent fill/outline) |
| Splitter | Draggable `EditorSplitGutter`, default 48/52, persisted `editorSplitRatio` |
| Reading mode | ⋯ toggle — hides edit chrome; click to edit |
| QA review mode | ⋯ toggle — filters to QA paragraphs only |
| QA counter | Toolbar chip `{n} cần kiểm tra`, hidden when zero; cycles paragraphs |
| Chapter completion | Toolbar status `✓ Chương đã dịch` + optional next chapter CTA |
| Auto-advance | ⋯ setting, default OFF; after successful job + save + no QA |
| Font presets | ⋯ Nhỏ / Vừa / Lớn (no CSS numbers) |
| Focus mode | Hides rail + context; edge controls restore panels |
| Context scoping | Paragraph with no hits → empty scoped context (not full chapter) |
| Copy toast | ~2s duration |
| Export toast | Title + [Mở file] [Mở thư mục] actions |
| Interrupt strip | Mid-chapter failure banner + resume from paragraph |
| Unsaved safety | Flush before chapter/project switch; warn on flush failure; beforeunload |
| i18n | vi + en strings for all new UX |

## Final acceptance checklist

- [x] Chapter header icons no longer overlap (Phase 5)
- [x] Context collapsed by default
- [x] Empty context does not consume ~300px (collapsed rail)
- [x] Dịch tiếp visually strongest action (Phase 6)
- [x] Dịch tiếp visible at 1366px
- [x] Export label `Xuất` (not Xuất dữ liệu)
- [x] Chapter prev/next one click
- [x] Source/Translation editor dominates screen
- [x] No unnecessary horizontal scrollbar (overflow-x hidden on editor scroll)
- [x] Frequent actions minimum clicks
- [x] Advanced actions in ⋯ menu

## Tests

- `tests/unit/editor/editor-chapter-utils.test.ts`
- `tests/unit/editor/editor-context-filter.test.ts` (scoped empty fallback)
- `tests/unit/editor/editor-paragraph-row.test.tsx` (paragraph menu)
- `tests/unit/translation/translation-workspace-store.test.ts` (v3 persist)

## Deferred / follow-up

- **Performance audit (§19–20):** typing re-render profiling and dev benchmarks not automated in CI
- **Screenshot matrix (§21):** manual capture at 1366×768 and 1920×1080
- **Paragraph lock:** menu item present; backend toggle not wired
- **Character click-through:** term click wired; character highlight in source may need backend highlights

## Key files

- `src/renderer/features/translation/hooks/useTranslationEditorController.tsx`
- `src/renderer/components/translation/TranslationCommandBar.tsx`
- `src/renderer/components/translation/BilingualEditor.tsx`
- `src/renderer/stores/translation-workspace-store.ts`
- `src/renderer/utils/editor-chapter-utils.ts`
