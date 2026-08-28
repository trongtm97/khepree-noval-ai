import { createHash } from 'node:crypto';
import type { MigrationDefinition } from '../migration-runner';
import { MIGRATION_001_INITIAL_SCHEMA } from './001-initial-schema';
import { MIGRATION_002_INDEXES_FTS } from './002-indexes-fts';
import { MIGRATION_003_SECURITY } from './003-security';
import { MIGRATION_004_GOOGLE_ACCOUNTS } from './004-google-accounts';
import { MIGRATION_005_TERM_VAULT } from './005-term-vault';
import { MIGRATION_006_MEMORY_ENGINE } from './006-memory-engine';
import { MIGRATION_007_DRIVE_SYNC } from './007-drive-sync';
import { MIGRATION_008_NOTEBOOK_PROVIDER } from './008-notebook-provider';
import { MIGRATION_009_GEMINI_PROVIDER } from './009-gemini-provider';
import { MIGRATION_010_JOB_REPAIR } from './010-job-repair';
import { MIGRATION_011_JOB_SCHEDULER } from './011-job-scheduler';
import { MIGRATION_012_LEARNING_PIPELINE } from './012-learning-pipeline';
import { MIGRATION_013_TRANSLATION_EDITOR } from './013-translation-editor';
import { MIGRATION_014_SOURCE_FOLDER } from './014-source-folder';
import { MIGRATION_015_BOOK_METADATA } from './015-book-metadata';
import { MIGRATION_016_AI_PROVIDERS } from './016-ai-providers';
import { MIGRATION_017_NOTEBOOK_KNOWLEDGE } from './017-notebook-knowledge';
import { MIGRATION_018_BOOTSTRAP_LIFECYCLE } from './018-bootstrap-lifecycle';
import { MIGRATION_019_PARAGRAPH_TRAILING_NEWLINES } from './019-paragraph-trailing-newlines';
import { MIGRATION_020_FULL_NOVEL_PREPROCESS } from './020-full-novel-preprocess';
import { MIGRATION_021_NOTEBOOK_ROLE } from './021-notebook-role';
import { MIGRATION_022_BATCH_SIZE_DECISIONS } from './022-batch-size-decisions';
import { MIGRATION_023_GEMINI_REQUEST_LIFECYCLE } from './023-gemini-request-lifecycle';
import { MIGRATION_024_NOTEBOOK_SOURCE_BINDINGS } from './024-notebook-source-bindings';
import { MIGRATION_025_KNOWLEDGE_VERSION_PROBE } from './025-knowledge-version-probe';
import { MIGRATION_026_REPAIR_CHANNEL_CONTEXT } from './026-repair-channel-context';
import { MIGRATION_027_LANGUAGE_PROFILES } from './027-language-profiles';
import { MIGRATION_028_GENERIC_BOOK_TITLES } from './028-generic-book-titles';
import { MIGRATION_029_MULTILINGUAL_TERMS } from './029-multilingual-terms';
import { MIGRATION_030_TRANSLATION_WAVES } from './030-translation-waves';
import {
  MIGRATION_031_TRANSLATION_EDITIONS,
  runMigration031Backfill,
} from './031-translation-editions';
import {
  MIGRATION_032_CHARACTER_TRANSLATIONS,
  runMigration032Backfill,
} from './032-character-translations';
import { MIGRATION_033_IMPORT_HISTORY } from './033-import-history';
import { MIGRATION_034 } from './034-source-language-detection';
import { MIGRATION_035_LEGACY_DRIVE_DEPRECATION } from './035-legacy-drive-deprecation';
import { MIGRATION_036_CONTEXT_FINGERPRINT } from './036-context-fingerprint';
import { MIGRATION_037_RESEARCH_NOTEBOOK } from './037-research-notebook-persistence';
import { MIGRATION_038_LOCAL_LEARNING_LOOP } from './038-local-learning-loop';

export const MIGRATIONS: MigrationDefinition[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: MIGRATION_001_INITIAL_SCHEMA,
  },
  {
    version: 2,
    name: 'indexes_fts',
    sql: MIGRATION_002_INDEXES_FTS,
  },
  {
    version: 3,
    name: 'security',
    sql: MIGRATION_003_SECURITY,
  },
  {
    version: 4,
    name: 'google_accounts',
    sql: MIGRATION_004_GOOGLE_ACCOUNTS,
  },
  {
    version: 5,
    name: 'term_vault',
    sql: MIGRATION_005_TERM_VAULT,
  },
  {
    version: 6,
    name: 'memory_engine',
    sql: MIGRATION_006_MEMORY_ENGINE,
  },
  {
    version: 7,
    name: 'drive_sync',
    sql: MIGRATION_007_DRIVE_SYNC,
  },
  {
    version: 8,
    name: 'notebook_provider',
    sql: MIGRATION_008_NOTEBOOK_PROVIDER,
  },
  {
    version: 9,
    name: 'gemini_provider',
    sql: MIGRATION_009_GEMINI_PROVIDER,
  },
  {
    version: 10,
    name: 'job_repair',
    sql: MIGRATION_010_JOB_REPAIR,
  },
  {
    version: 11,
    name: 'job_scheduler',
    sql: MIGRATION_011_JOB_SCHEDULER,
  },
  {
    version: 12,
    name: 'learning_pipeline',
    sql: MIGRATION_012_LEARNING_PIPELINE,
  },
  {
    version: 13,
    name: 'translation_editor',
    sql: MIGRATION_013_TRANSLATION_EDITOR,
  },
  {
    version: 14,
    name: 'source_folder',
    sql: MIGRATION_014_SOURCE_FOLDER,
  },
  {
    version: 15,
    name: 'book_metadata',
    sql: MIGRATION_015_BOOK_METADATA,
  },
  {
    version: 16,
    name: 'ai_providers',
    sql: MIGRATION_016_AI_PROVIDERS,
  },
  {
    version: 17,
    name: 'notebook_knowledge',
    sql: MIGRATION_017_NOTEBOOK_KNOWLEDGE,
  },
  {
    version: 18,
    name: 'bootstrap_lifecycle',
    sql: MIGRATION_018_BOOTSTRAP_LIFECYCLE,
  },
  {
    version: 19,
    name: 'paragraph_trailing_newlines',
    sql: MIGRATION_019_PARAGRAPH_TRAILING_NEWLINES,
  },
  {
    version: 20,
    name: 'full_novel_preprocess',
    sql: MIGRATION_020_FULL_NOVEL_PREPROCESS,
  },
  {
    version: 21,
    name: 'notebook_role',
    sql: MIGRATION_021_NOTEBOOK_ROLE,
  },
  {
    version: 22,
    name: 'batch_size_decisions',
    sql: MIGRATION_022_BATCH_SIZE_DECISIONS,
  },
  {
    version: 23,
    name: 'gemini_request_lifecycle',
    sql: MIGRATION_023_GEMINI_REQUEST_LIFECYCLE,
  },
  {
    version: 24,
    name: 'notebook_source_bindings',
    sql: MIGRATION_024_NOTEBOOK_SOURCE_BINDINGS,
  },
  {
    version: 25,
    name: 'knowledge_version_probe',
    sql: MIGRATION_025_KNOWLEDGE_VERSION_PROBE,
  },
  {
    version: 26,
    name: 'repair_channel_context',
    sql: MIGRATION_026_REPAIR_CHANNEL_CONTEXT,
  },
  {
    version: 27,
    name: 'language_profiles',
    sql: MIGRATION_027_LANGUAGE_PROFILES,
  },
  {
    version: 28,
    name: 'generic_book_titles',
    sql: MIGRATION_028_GENERIC_BOOK_TITLES,
  },
  {
    version: 29,
    name: 'multilingual_terms',
    sql: MIGRATION_029_MULTILINGUAL_TERMS,
  },
  {
    version: 30,
    name: 'translation_waves',
    sql: MIGRATION_030_TRANSLATION_WAVES,
  },
  {
    version: 31,
    name: 'translation_editions',
    sql: MIGRATION_031_TRANSLATION_EDITIONS,
    run: runMigration031Backfill,
  },
  {
    version: 32,
    name: 'character_translations',
    sql: MIGRATION_032_CHARACTER_TRANSLATIONS,
    run: runMigration032Backfill,
  },
  {
    version: 33,
    name: 'import_history',
    sql: MIGRATION_033_IMPORT_HISTORY,
  },
  MIGRATION_034,
  {
    version: 35,
    name: 'legacy_drive_deprecation',
    sql: MIGRATION_035_LEGACY_DRIVE_DEPRECATION,
  },
  {
    version: 36,
    name: 'context_fingerprint',
    sql: MIGRATION_036_CONTEXT_FINGERPRINT,
  },
  {
    version: 37,
    name: 'research_notebook_persistence',
    sql: MIGRATION_037_RESEARCH_NOTEBOOK,
  },
  {
    version: 38,
    name: 'local_learning_loop',
    sql: MIGRATION_038_LOCAL_LEARNING_LOOP,
  },
];

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}
