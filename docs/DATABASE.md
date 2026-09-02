# Khepree Novel AI — Database Design

> SQLite via `better-sqlite3`. Database file: `%APPDATA%/KhepreeNovelAI/data/khepree-novel-ai.db`. WAL mode enabled.

## 1. Location & Conventions

| Item | Value |
|------|-------|
| AppData root | `%APPDATA%/KhepreeNovelAI/` (via `app.getPath('appData')`) |
| Database file | `{AppData}/KhepreeNovelAI/data/khepree-novel-ai.db` |
| Backups | `{AppData}/KhepreeNovelAI/backups/` |
| Primary keys | TEXT UUID v4 |
| Timestamps | ISO 8601 UTC (`created_at`, `updated_at`) |
| Soft delete | `deleted_at` on `projects`, `terms` |
| Foreign keys | `ON` (`PRAGMA foreign_keys = ON`) |
| Journal | WAL |

**No ORM auto-sync.** Schema changes only via numbered SQL migrations.

## 2. Migration System

### Tracking

```sql
CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TEXT NOT NULL,
  checksum    TEXT NOT NULL  -- SHA-256 of migration SQL
);
```

### Files

| Version | Name | File |
|---------|------|------|
| 1 | `initial_schema` | `src/main/db/migrations/001-initial-schema.ts` |
| 13 | `translation_editor` | `src/main/db/migrations/013-translation-editor.ts` |
| 14 | `source_folder` | `src/main/db/migrations/014-source-folder.ts` — folder source config on `projects`, source metadata on `chapters` |
| 15 | `book_metadata` | `src/main/db/migrations/015-book-metadata.ts` — project metadata columns, `project_documents`, `chapter_type` / `sequence_order` |
| 16 | `ai_providers` | `src/main/db/migrations/016-ai-providers.ts` — `ai_providers`, `ai_accounts`, `ai_models`, fallback `app_meta` |

### Runner behavior

1. Compare `MAX(schema_migrations.version)` vs available migrations
2. If DB exists at version ≥ 1 → **automatic file backup** to `backups/khepree-novel-ai-pre-migration-{timestamp}.db`
3. Apply each pending migration inside a **transaction**
4. Record version + checksum in `schema_migrations`
5. On success → delete backup; on failure → **restore from backup**

### Policy

- Never drop columns in-place — add, migrate, deprecate
- Migrations use `IF NOT EXISTS` where possible
- Runner executes on app startup before repository access

## 3. Entity Relationship

```
app_meta

google_accounts ─┬─ google_browser_profiles
                 ├─ google_oauth_credentials
                 └─ worker_states

projects ─┬─ project_settings
          ├─ project_documents     # auxiliary source files (summary, preface, …)
          ├─ chapters ─── chapter_paragraphs ─── translations ─── translation_versions
          ├─ characters ─── character_aliases
          │              └── character_relationships
          ├─ terms (via project_terms)
          ├─ story_states
          ├─ memory_events
          ├─ jobs ─── job_attempts
          ├─ drive_resources
          └── notebook_resources

terms ─── term_translations
      └── term_occurrences

automation_events (→ jobs, worker_states)
```

## 4. Tables

### `app_meta`

Key-value store for application metadata (includes cached `schema_version`).

| Column | Type |
|--------|------|
| key | TEXT PK |
| value | TEXT |
| updated_at | TEXT |

### Google

#### `google_accounts`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| label | TEXT | Display name |
| email | TEXT | nullable |
| status | TEXT | pending_login \| active \| expired \| disabled |
| created_at, updated_at | TEXT | |

#### `google_browser_profiles`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| google_account_id | TEXT FK UNIQUE | |
| profile_dir_name | TEXT | Subdir under browser-profiles |
| last_session_check_at | TEXT | |
| created_at, updated_at | TEXT | |

#### `google_oauth_credentials`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| google_account_id | TEXT FK | |
| credential_type | TEXT | oauth_refresh \| oauth_access |
| encrypted_blob | BLOB | safeStorage encrypted |
| expires_at | TEXT | |
| created_at, updated_at | TEXT | |

### Projects

#### `projects`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| title | TEXT NOT NULL | |
| source_language | TEXT | default `zh` |
| target_language | TEXT | default `vi` |
| genre | TEXT | |
| description | TEXT | |
| title_cn, title_vi | TEXT | Original / Vietnamese titles (migration 15) |
| author_name | TEXT | |
| subgenres, publication_status | TEXT | |
| expected_chapter_count | INTEGER | |
| introduction, official_summary, notes | TEXT | Metadata — not chapters |
| metadata_source, metadata_fields | TEXT | Provenance + per-field lock state |
| book_profile_dirty | INTEGER | Notebook sync flag |
| status | TEXT | draft \| active \| archived |
| created_at, updated_at | TEXT | |
| deleted_at | TEXT | soft delete |

#### `project_settings`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| project_id | TEXT FK UNIQUE | |
| style_config | TEXT | JSON |
| import_config | TEXT | JSON |
| created_at, updated_at | TEXT | |

#### `project_documents` (migration 15)

Auxiliary text imported from source folder (not translation chapters).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| project_id | TEXT FK | |
| document_type | TEXT | e.g. OFFICIAL_SUMMARY, AUTHOR_NOTE, PREFACE |
| source_file_name, source_file_path | TEXT | |
| content_text | TEXT | |
| content_hash | TEXT | |
| created_at, updated_at | TEXT | |

### Chapters & Translation

#### `chapters`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| project_id | TEXT FK | |
| chapter_number | INTEGER | Nullable for prologue / extras (migration 15) |
| chapter_type | TEXT | NORMAL \| PROLOGUE \| EPILOGUE \| EXTRA \| … |
| sequence_order | INTEGER | Primary sort (prologue = 0) |
| display_title | TEXT | UI label e.g. "Chương mở đầu" |
| chapter_title | TEXT | |
| source_text | TEXT | Full chapter source |
| source_hash | TEXT | SHA-256 |
| status | TEXT | pending \| imported \| translated |
| created_at, updated_at | TEXT | |

Unique: `(project_id, chapter_number)`

#### `chapter_paragraphs`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Internal UUID |
| chapter_id | TEXT FK | |
| paragraph_id | TEXT | Stable `[C000001:P000001]` |
| sequence | INTEGER | Order in chapter |
| source_text | TEXT | |
| source_hash | TEXT | |
| created_at, updated_at | TEXT | |

Unique: `(chapter_id, paragraph_id)`, `(chapter_id, sequence)`

#### `translations`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| paragraph_id | TEXT FK → chapter_paragraphs.id | |
| translated_text | TEXT | Vietnamese |
| status | TEXT | pending \| translated \| qa_failed \| approved |
| provider | TEXT | gemini \| notebook |
| model | TEXT | |
| metadata | TEXT | JSON |
| created_at, updated_at | TEXT | |

#### `translation_versions`

Append-only history per translation.

| Column | Type |
|--------|------|
| id | TEXT PK |
| translation_id | TEXT FK |
| version | INTEGER |
| translated_text | TEXT |
| status | TEXT |
| provider, model, metadata | TEXT |
| created_at | TEXT |

Unique: `(translation_id, version)`

### Characters

#### `characters`

| Column | Type |
|--------|------|
| id | TEXT PK |
| project_id | TEXT FK |
| canonical_name | TEXT |
| translated_name | TEXT |
| gender, role, description | TEXT |
| first_appearance_paragraph_id | TEXT |
| metadata | TEXT JSON |
| created_at, updated_at | TEXT |

#### `character_aliases`

| Column | Type |
|--------|------|
| id | TEXT PK |
| character_id | TEXT FK |
| alias | TEXT |
| alias_type | TEXT | name \| title \| nickname |
| created_at, updated_at | TEXT |

#### `character_relationships`

| Column | Type |
|--------|------|
| id | TEXT PK |
| project_id | TEXT FK |
| from_character_id | TEXT FK |
| to_character_id | TEXT FK |
| relationship_type | TEXT |
| description | TEXT |
| since_paragraph_id | TEXT |
| created_at, updated_at | TEXT |

### Terms

#### `terms`

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| source_simplified | TEXT | Chinese simplified |
| source_traditional | TEXT | Chinese traditional |
| pinyin | TEXT | |
| term_type | TEXT | name \| place \| item \| skill \| organization \| title \| other |
| genre | TEXT | |
| scope | TEXT | GLOBAL \| GENRE \| USER \| PROJECT \| CONTEXT |
| scope_ref | TEXT | project_id, genre, etc. |
| status | TEXT | see promotion pipeline |
| confidence | REAL | 0–1 |
| occurrence_count | INTEGER | |
| novel_count | INTEGER | |
| locked | INTEGER | 0/1 |
| notes | TEXT | |
| created_at, updated_at | TEXT | |
| deleted_at | TEXT | |

**Promotion pipeline:** `DISCOVERED → CANDIDATE → PROJECT_VERIFIED → GENRE_VERIFIED → GLOBAL_VERIFIED → LOCKED` (+ `REJECTED`)

#### `term_translations`

| Column | Type |
|--------|------|
| id | TEXT PK |
| term_id | TEXT FK |
| target_text | TEXT | Vietnamese |
| is_primary | INTEGER | |
| created_at, updated_at | TEXT |

#### `term_occurrences`

| Column | Type |
|--------|------|
| id | TEXT PK |
| term_id | TEXT FK |
| project_id | TEXT FK |
| chapter_id | TEXT FK nullable |
| paragraph_id | TEXT | stable ID |
| context_snippet | TEXT |
| created_at | TEXT |

#### `project_terms`

Links terms to projects with optional status override.

| Column | Type |
|--------|------|
| id | TEXT PK |
| project_id | TEXT FK |
| term_id | TEXT FK |
| status | TEXT nullable |
| notes | TEXT |
| created_at, updated_at | TEXT |

Unique: `(project_id, term_id)`

### Memory

#### `story_states`

| Column | Type |
|--------|------|
| id | TEXT PK |
| project_id | TEXT FK UNIQUE |
| current_chapter_number | INTEGER |
| state_json | TEXT JSON |
| created_at, updated_at | TEXT |

#### `memory_events`

| Column | Type |
|--------|------|
| id | TEXT PK |
| project_id | TEXT FK |
| category | TEXT | plot \| world \| glossary \| character \| custom |
| event_key | TEXT |
| event_value | TEXT JSON |
| source | TEXT | manual \| ai_delta \| import |
| created_at, updated_at | TEXT |

Unique: `(project_id, category, event_key)`

### Jobs & Workers

#### `worker_states`

| Column | Type |
|--------|------|
| id | TEXT PK |
| google_account_id | TEXT FK UNIQUE |
| provider_type | TEXT | gemini \| notebook |
| quota_state | TEXT | ok \| warning \| exhausted |
| quota_reset_at | TEXT |
| is_enabled | INTEGER |
| priority | INTEGER |
| config | TEXT JSON |
| last_active_at | TEXT |
| created_at, updated_at | TEXT |

#### `jobs`

| Column | Type |
|--------|------|
| id | TEXT PK |
| project_id | TEXT FK |
| type | TEXT | translate_batch \| repair \| sync |
| state | TEXT | QUEUED \| … \| COMPLETED |
| worker_id | TEXT FK nullable |
| config, progress | TEXT JSON |
| error, paused_reason | TEXT |
| created_at, updated_at, started_at, completed_at | TEXT |

#### `job_attempts`

| Column | Type |
|--------|------|
| id | TEXT PK |
| job_id | TEXT FK |
| attempt_number | INTEGER |
| state | TEXT |
| error | TEXT |
| started_at, completed_at | TEXT |
| created_at, updated_at | TEXT |

### Resources & Automation

#### `drive_resources` (legacy — read-only)

> **Deprecated (Phase 9).** Table kept so existing databases open without migration. New projects do not write Drive file IDs. Use `knowledge_files` + local cache instead.

| Column | Type |
|--------|------|
| id | TEXT PK |
| project_id | TEXT FK |
| drive_file_id | TEXT |
| resource_type | TEXT |
| local_path | TEXT |
| remote_hash, local_hash | TEXT |
| last_synced_at | TEXT |
| created_at, updated_at | TEXT |

#### `notebook_resources`

| Column | Type |
|--------|------|
| id | TEXT PK |
| project_id | TEXT FK |
| notebook_id | TEXT |
| resource_url | TEXT |
| linked_drive_resource_id | TEXT FK nullable |
| status | TEXT |
| created_at, updated_at | TEXT |

#### `automation_events`

| Column | Type |
|--------|------|
| id | TEXT PK |
| job_id | TEXT FK nullable |
| worker_id | TEXT FK nullable |
| event_type | TEXT |
| payload | TEXT JSON |
| screenshot_path | TEXT |
| created_at | TEXT |

## 5. Indexes

See migration 002. Key indexes:

- `projects(status)`, `projects(updated_at)`
- `chapters(project_id)`, `chapters(project_id, status)`
- `chapter_paragraphs(chapter_id)`, `chapter_paragraphs(paragraph_id)`
- `translations(paragraph_id, status)`
- `terms(scope, scope_ref)`, `terms(status)`, `terms(source_simplified)`, `terms(genre)`
- `jobs(project_id)`, `jobs(state)`

## 6. FTS5 Full-Text Search

| Virtual table | Source | Indexed columns |
|---------------|--------|-----------------|
| `terms_fts` | `terms` | source_simplified, source_traditional, pinyin |
| `characters_fts` | `characters` | canonical_name, translated_name, description |
| `chapters_fts` | `chapters` | chapter_title, source_text |

Maintained via `AFTER INSERT/UPDATE/DELETE` triggers. Tokenizer: `unicode61`.

## 7. Repository Layer

| Repository | Tables |
|------------|--------|
| `AppMetaRepository` | app_meta |
| `ProjectRepository` | projects, project_settings |
| `ChapterRepository` | chapters (+ FTS search) |
| `ParagraphRepository` | chapter_paragraphs |
| `TranslationRepository` | translations, translation_versions |
| `TermRepository` | terms, term_translations, term_occurrences, project_terms (+ FTS) |
| `CharacterRepository` | characters, character_aliases (+ FTS) |
| `JobRepository` | jobs, job_attempts |
| `GoogleAccountRepository` | google_accounts, google_browser_profiles |

Access via `DatabaseManager` singleton:

```typescript
import { getDatabase } from './db/connection';

const db = getDatabase();
const project = db.projects.create({ title: 'My Novel' });
```

Services **must not** import `better-sqlite3` directly.

## 8. Transaction Helper

```typescript
import { withTransaction } from './db/transaction';

withTransaction(db.getConnection(), () => {
  // multiple statements — all-or-nothing
});
```

## 9. Module Layout

```
src/main/db/
├── connection.ts           # re-exports
├── database-manager.ts     # open, migrate, repositories
├── migration-runner.ts
├── backup.ts
├── transaction.ts
├── migrations/
│   ├── 001-initial-schema.ts
│   ├── 002-indexes-fts.ts
│   └── index.ts
├── repositories/
└── utils/
    ├── uuid.ts
    └── timestamps.ts
```

## 10. Migration Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-08-23 | Initial schema — all core tables |
| 2 | 2026-08-23 | Indexes + FTS5 virtual tables + triggers |
| 3 | 2026-08-23 | `secrets`, `audit_events`, diagnostic content logging flag |

## 11. Testing

`tests/unit/db/database.test.ts` covers:

- Database creation + migration to v3
- CRUD via repositories
- Transaction rollback
- FTS search (terms, characters, chapters)
- Close/reopen persistence
- Pre-migration backup
- Restore on failed migration

Run: `npm test` (auto-rebuilds better-sqlite3 for Node, then restores Electron build).
