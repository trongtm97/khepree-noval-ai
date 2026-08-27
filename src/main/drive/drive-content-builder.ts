import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import {
  DRIVE_PROJECT_FILES,
  DRIVE_RESOURCE_KEYS,
  type DriveResourceKey,
} from '@shared/constants/drive';
import {
  KNOWLEDGE_DRIVE_DOC_TITLES,
  type DriveProjectDocTitle,
} from '@shared/constants/notebook-source-binding';
import type { KnowledgeType } from '@shared/constants/knowledge';
import {
  NotebookKnowledgeBuilder,
  type ProjectKnowledgeDocuments,
} from '../notebook/knowledge-builder';

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function sanitizeProjectFolderName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : 'Untitled Project';
}

export type ProjectDriveDocuments = ProjectKnowledgeDocuments;

/** @deprecated Prefer NotebookKnowledgeBuilder — kept as thin Drive-facing wrapper. */
export function buildProjectDriveDocuments(
  db: DatabaseManager,
  projectId: string,
): ProjectDriveDocuments {
  return new NotebookKnowledgeBuilder(db).buildAll(projectId);
}

export const OWNED_FILE_KEYS = [
  DRIVE_RESOURCE_KEYS.BOOK_PROFILE_MD,
  DRIVE_RESOURCE_KEYS.RULES_MD,
  DRIVE_RESOURCE_KEYS.PROJECT_TERMS_MD,
  DRIVE_RESOURCE_KEYS.CHARACTERS_MD,
  DRIVE_RESOURCE_KEYS.RELATIONSHIPS_MD,
  DRIVE_RESOURCE_KEYS.STORY_STATE_MD,
  DRIVE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD,
  DRIVE_RESOURCE_KEYS.RECENT_CONTEXT_MD,
  DRIVE_RESOURCE_KEYS.SYNC_STATE_MD,
] as const satisfies readonly DriveResourceKey[];

export type OwnedFileKey = (typeof OWNED_FILE_KEYS)[number];

export const FILE_KEY_TO_NAME: Record<OwnedFileKey, (typeof DRIVE_PROJECT_FILES)[number]> = {
  [DRIVE_RESOURCE_KEYS.BOOK_PROFILE_MD]: '00_BOOK_PROFILE.md',
  [DRIVE_RESOURCE_KEYS.RULES_MD]: '01_TRANSLATION_RULES.md',
  [DRIVE_RESOURCE_KEYS.PROJECT_TERMS_MD]: '02_PROJECT_TERMS.md',
  [DRIVE_RESOURCE_KEYS.CHARACTERS_MD]: '03_CHARACTERS.md',
  [DRIVE_RESOURCE_KEYS.RELATIONSHIPS_MD]: '04_RELATIONSHIPS.md',
  [DRIVE_RESOURCE_KEYS.STORY_STATE_MD]: '05_STORY_STATE.md',
  [DRIVE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD]: '06_WORLD_KNOWLEDGE.md',
  [DRIVE_RESOURCE_KEYS.RECENT_CONTEXT_MD]: '07_RECENT_CONTEXT.md',
  [DRIVE_RESOURCE_KEYS.SYNC_STATE_MD]: '08_SYNC_STATE.md',
};

/** Google Doc titles (no .md) — preferred live Notebook sources. */
export const FILE_KEY_TO_DOC_TITLE: Record<OwnedFileKey, DriveProjectDocTitle> = {
  [DRIVE_RESOURCE_KEYS.BOOK_PROFILE_MD]: KNOWLEDGE_DRIVE_DOC_TITLES.book_profile,
  [DRIVE_RESOURCE_KEYS.RULES_MD]: KNOWLEDGE_DRIVE_DOC_TITLES.translation_rules,
  [DRIVE_RESOURCE_KEYS.PROJECT_TERMS_MD]: KNOWLEDGE_DRIVE_DOC_TITLES.project_terms,
  [DRIVE_RESOURCE_KEYS.CHARACTERS_MD]: KNOWLEDGE_DRIVE_DOC_TITLES.characters,
  [DRIVE_RESOURCE_KEYS.RELATIONSHIPS_MD]: KNOWLEDGE_DRIVE_DOC_TITLES.relationships,
  [DRIVE_RESOURCE_KEYS.STORY_STATE_MD]: KNOWLEDGE_DRIVE_DOC_TITLES.story_state,
  [DRIVE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD]: KNOWLEDGE_DRIVE_DOC_TITLES.world_knowledge,
  [DRIVE_RESOURCE_KEYS.RECENT_CONTEXT_MD]: KNOWLEDGE_DRIVE_DOC_TITLES.recent_context,
  [DRIVE_RESOURCE_KEYS.SYNC_STATE_MD]: KNOWLEDGE_DRIVE_DOC_TITLES.sync_state,
};

export const FILE_KEY_TO_KNOWLEDGE_TYPE: Record<OwnedFileKey, KnowledgeType> = {
  [DRIVE_RESOURCE_KEYS.BOOK_PROFILE_MD]: 'book_profile',
  [DRIVE_RESOURCE_KEYS.RULES_MD]: 'translation_rules',
  [DRIVE_RESOURCE_KEYS.PROJECT_TERMS_MD]: 'project_terms',
  [DRIVE_RESOURCE_KEYS.CHARACTERS_MD]: 'characters',
  [DRIVE_RESOURCE_KEYS.RELATIONSHIPS_MD]: 'relationships',
  [DRIVE_RESOURCE_KEYS.STORY_STATE_MD]: 'story_state',
  [DRIVE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD]: 'world_knowledge',
  [DRIVE_RESOURCE_KEYS.RECENT_CONTEXT_MD]: 'recent_context',
  [DRIVE_RESOURCE_KEYS.SYNC_STATE_MD]: 'sync_state',
};

/** Write knowledge markdown files for Notebook upload fallback (00_…07_). */
export function writeKnowledgeSourceFiles(
  dir: string,
  sources: { name: string; content: string }[],
): string[] {
  fs.mkdirSync(dir, { recursive: true });
  const paths: string[] = [];
  for (const source of sources) {
    const filePath = path.join(dir, source.name);
    fs.writeFileSync(filePath, source.content, 'utf8');
    paths.push(filePath);
  }
  return paths;
}
