# Data Portability (Phase 18)

Export novels, backup/restore, term vault import preview.

## Routes

- `/export` — Export & Backup UI

## Novel export

Formats: **TXT**, **DOCX**, **EPUB (jszip).

| Option | Default |
|--------|---------|
| Chapter range | all |
| Translated only | on |
| Chapter titles | on |
| Paragraph IDs | off |

IPC: `portability:exportNovel`, `portability:selectExportPath`

## Backups

### Full (`.nts-backup.zip`)

Sanitized DB + settings + terms + automation manifest. No browser profiles or credentials by default.

### Project (`.nts-project.zip`)

JSON bundle for one project.

### Restore

Preview then restore with `confirmOverwrite` when data exists. Full restore needs app restart.

## Auto backup

`backup.auto.*` in app_meta. Default: off, 24h interval, retain 7.

## Term import

`term:previewImport` + `term:commitImport` (skip / merge / replace duplicates).

## Tests

`npm test -- tests/unit/portability`
