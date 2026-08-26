# Translation Editor (Phase 17)

Professional split editor for reviewing and correcting Vietnamese translations.

## Route

`/editor` — split editor UI  
`/translation` — pack builder (unchanged)

## Layout

| Left | Right |
|------|-------|
| Chinese source (read-only, term highlights) | Vietnamese translation (editable) |

Paragraphs align by stable ID (`[C000001:P000001]`).

Click either column → highlights paired row (shared `activeParagraphId`).

## Version sources

| Source | Meaning |
|--------|---------|
| `AI_INITIAL` | First AI pass persisted on job QA PASS |
| `AI_REPAIR` | Repair round persisted on PASS |
| `HUMAN_EDIT` | Manual edit in editor |
| `SYSTEM_TERM_FIX` | Reserved for automated term corrections |

Human edits set `human_locked = 1`. AI batch persist (`persistParsedTranslations`) skips locked rows.

## Features

- Chapter navigation (prev/next, Alt+↑/↓)
- Search (Ctrl+F) + next match (Ctrl+G)
- Replace all in translation column (Ctrl+H)
- Autosave debounce (`EDITOR_AUTOSAVE_MS` = 800ms) → `HUMAN_EDIT`
- Version history panel + revert
- Status badges: version source, QA warnings
- Context panel: characters, relationships, terms, memory snippet
- Term hover: Vietnamese, type, scope, confidence
- Undo/redo (Ctrl+Z / Ctrl+Y)
- Virtualized paragraph list (fixed row height) — no full-novel re-render

## IPC

| Channel | Purpose |
|---------|---------|
| `editor:getChapter` | Load paragraphs + translations + term highlights |
| `editor:saveParagraph` | Save human edit |
| `editor:listVersions` | Version history |
| `editor:revertVersion` | Revert to prior version |
| `editor:getContext` | Context panel data |

## Schema (migration 013)

- `translations.human_locked`, `translations.version_source`
- `translation_versions.version_source`, `translation_versions.editor_note`

## Key files

- `src/main/services/translation-editor-service.ts`
- `src/main/learning/translation-persistence.ts`
- `src/main/jobs/repair-loop.ts` — persist on PASS
- `src/renderer/pages/TranslationEditorPage.tsx`
- `tests/unit/editor/`

## Tests

```bash
npm test -- tests/unit/editor
```
