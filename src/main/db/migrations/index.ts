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
];

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}
