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

export const FILE_KEY_TO_NAME: Record<
  | typeof DRIVE_RESOURCE_KEYS.BOOK_PROFILE_MD
  | typeof DRIVE_RESOURCE_KEYS.RULES_MD
  | typeof DRIVE_RESOURCE_KEYS.PROJECT_TERMS_MD
  | typeof DRIVE_RESOURCE_KEYS.CHARACTERS_MD
  | typeof DRIVE_RESOURCE_KEYS.RELATIONSHIPS_MD
  | typeof DRIVE_RESOURCE_KEYS.STORY_STATE_MD
  | typeof DRIVE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD
  | typeof DRIVE_RESOURCE_KEYS.RECENT_CONTEXT_MD,
  (typeof DRIVE_PROJECT_FILES)[number]
> = {
  [DRIVE_RESOURCE_KEYS.BOOK_PROFILE_MD]: '00_BOOK_PROFILE.md',
  [DRIVE_RESOURCE_KEYS.RULES_MD]: '01_TRANSLATION_RULES.md',
  [DRIVE_RESOURCE_KEYS.PROJECT_TERMS_MD]: '02_PROJECT_TERMS.md',
  [DRIVE_RESOURCE_KEYS.CHARACTERS_MD]: '03_CHARACTERS.md',
  [DRIVE_RESOURCE_KEYS.RELATIONSHIPS_MD]: '04_RELATIONSHIPS.md',
  [DRIVE_RESOURCE_KEYS.STORY_STATE_MD]: '05_STORY_STATE.md',
  [DRIVE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD]: '06_WORLD_KNOWLEDGE.md',
  [DRIVE_RESOURCE_KEYS.RECENT_CONTEXT_MD]: '07_RECENT_CONTEXT.md',
};

export const OWNED_FILE_KEYS = [
  DRIVE_RESOURCE_KEYS.BOOK_PROFILE_MD,
  DRIVE_RESOURCE_KEYS.RULES_MD,
  DRIVE_RESOURCE_KEYS.PROJECT_TERMS_MD,
  DRIVE_RESOURCE_KEYS.CHARACTERS_MD,
  DRIVE_RESOURCE_KEYS.RELATIONSHIPS_MD,
  DRIVE_RESOURCE_KEYS.STORY_STATE_MD,
  DRIVE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD,
  DRIVE_RESOURCE_KEYS.RECENT_CONTEXT_MD,
] as const satisfies readonly DriveResourceKey[];

/** Write knowledge markdown files for Notebook upload (00_…07_). */
export function writeKnowledgeSourceFiles(
  dir: string,
  sources: Array<{ name: string; content: string }>,
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
