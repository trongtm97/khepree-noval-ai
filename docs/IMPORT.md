# NovelTrans Studio — Novel Import Engine

> Phase 6. Parse → detect → preview → manual fix → commit. **No translation.**

## Formats

| Format | Notes |
|--------|-------|
| TXT | Stream read when file > 2 MiB; encoding detect |
| EPUB | ZIP + OPF spine → HTML text |
| DOCX | `mammoth` raw text |

## Encoding

1. UTF-8 BOM
2. Valid UTF-8
3. jschardet → GB18030 / GBK fallback for Chinese dumps

## ChapterDetector pipeline

Multiple line detectors (not one regex):

- Chinese `第…章` (Arabic / fullwidth / 中文数字)
- Prefixed `正文 第一章`
- Volume `卷一` / `第一卷`
- English `Chapter N`

Merge by line → confidence → slice bodies → paragraph segment → duplicate title/hash flags.

Fallback: whole file = one chapter (`全文`) if no boundaries.

## Preview fields

Per chapter: number, title, character count, paragraph count, confidence, duplicate flags, source hash, preview snippet.

## Stable IDs

```
[C000001:P000001]
```

Assigned at **commit** from sequential `chapter_number` + paragraph sequence.  
Renaming title does not change IDs.

## Manual split

`import:updatePreview` with `manualSplits: [{ offset, title? }]` on normalized text offsets.

## IPC

| Channel | Role |
|---------|------|
| `import:selectFile` | Native dialog |
| `import:preview` | Parse + detect (memory session) |
| `import:updatePreview` | Redetect / manual / patches |
| `import:commit` | Persist project + chapters + paragraphs |
| `import:discard` | Drop session |
| `project:list/create/get` | Project CRUD shell |

## Layout

```
src/main/import/
  encoding.ts
  chapter-detector/
  paragraphs/
  parsers/
  import-service.ts
src/shared/utils/stable-id.ts
src/renderer/components/ImportWizard.tsx
```
