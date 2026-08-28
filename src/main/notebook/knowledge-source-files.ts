import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import { KNOWLEDGE_RESOURCE_KEYS } from '@shared/constants/knowledge';
import {
  KNOWLEDGE_DOC_TITLES,
  type KnowledgeDocTitle,
} from '@shared/constants/notebook-source-binding';
import type { KnowledgeType } from '@shared/constants/knowledge';
import {
  NotebookKnowledgeBuilder,
  type ProjectKnowledgeDocuments,
} from './knowledge-builder';

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

export type ProjectKnowledgeSources = ProjectKnowledgeDocuments;

export function buildProjectKnowledgeSources(
  db: DatabaseManager,
  projectId: string,
): ProjectKnowledgeSources {
  return new NotebookKnowledgeBuilder(db).buildAll(projectId);
}

export const OWNED_FILE_KEYS = [
  KNOWLEDGE_RESOURCE_KEYS.BOOK_PROFILE_MD,
  KNOWLEDGE_RESOURCE_KEYS.RULES_MD,
  KNOWLEDGE_RESOURCE_KEYS.PROJECT_TERMS_MD,
  KNOWLEDGE_RESOURCE_KEYS.CHARACTERS_MD,
  KNOWLEDGE_RESOURCE_KEYS.RELATIONSHIPS_MD,
  KNOWLEDGE_RESOURCE_KEYS.STORY_STATE_MD,
  KNOWLEDGE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD,
  KNOWLEDGE_RESOURCE_KEYS.RECENT_CONTEXT_MD,
  KNOWLEDGE_RESOURCE_KEYS.SYNC_STATE_MD,
] as const;

export type OwnedFileKey = (typeof OWNED_FILE_KEYS)[number];

export const FILE_KEY_TO_NAME: Record<OwnedFileKey, string> = {
  [KNOWLEDGE_RESOURCE_KEYS.BOOK_PROFILE_MD]: '00_BOOK_PROFILE.md',
  [KNOWLEDGE_RESOURCE_KEYS.RULES_MD]: '01_TRANSLATION_RULES.md',
  [KNOWLEDGE_RESOURCE_KEYS.PROJECT_TERMS_MD]: '02_PROJECT_TERMS.md',
  [KNOWLEDGE_RESOURCE_KEYS.CHARACTERS_MD]: '03_CHARACTERS.md',
  [KNOWLEDGE_RESOURCE_KEYS.RELATIONSHIPS_MD]: '04_RELATIONSHIPS.md',
  [KNOWLEDGE_RESOURCE_KEYS.STORY_STATE_MD]: '05_STORY_STATE.md',
  [KNOWLEDGE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD]: '06_WORLD_KNOWLEDGE.md',
  [KNOWLEDGE_RESOURCE_KEYS.RECENT_CONTEXT_MD]: '07_RECENT_CONTEXT.md',
  [KNOWLEDGE_RESOURCE_KEYS.SYNC_STATE_MD]: '08_SYNC_STATE.md',
};

/** Notebook source display titles (no .md). */
export const FILE_KEY_TO_DOC_TITLE: Record<OwnedFileKey, KnowledgeDocTitle> = {
  [KNOWLEDGE_RESOURCE_KEYS.BOOK_PROFILE_MD]: KNOWLEDGE_DOC_TITLES.book_profile,
  [KNOWLEDGE_RESOURCE_KEYS.RULES_MD]: KNOWLEDGE_DOC_TITLES.translation_rules,
  [KNOWLEDGE_RESOURCE_KEYS.PROJECT_TERMS_MD]: KNOWLEDGE_DOC_TITLES.project_terms,
  [KNOWLEDGE_RESOURCE_KEYS.CHARACTERS_MD]: KNOWLEDGE_DOC_TITLES.characters,
  [KNOWLEDGE_RESOURCE_KEYS.RELATIONSHIPS_MD]: KNOWLEDGE_DOC_TITLES.relationships,
  [KNOWLEDGE_RESOURCE_KEYS.STORY_STATE_MD]: KNOWLEDGE_DOC_TITLES.story_state,
  [KNOWLEDGE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD]: KNOWLEDGE_DOC_TITLES.world_knowledge,
  [KNOWLEDGE_RESOURCE_KEYS.RECENT_CONTEXT_MD]: KNOWLEDGE_DOC_TITLES.recent_context,
  [KNOWLEDGE_RESOURCE_KEYS.SYNC_STATE_MD]: KNOWLEDGE_DOC_TITLES.sync_state,
};

export const FILE_KEY_TO_KNOWLEDGE_TYPE: Record<OwnedFileKey, KnowledgeType> = {
  [KNOWLEDGE_RESOURCE_KEYS.BOOK_PROFILE_MD]: 'book_profile',
  [KNOWLEDGE_RESOURCE_KEYS.RULES_MD]: 'translation_rules',
  [KNOWLEDGE_RESOURCE_KEYS.PROJECT_TERMS_MD]: 'project_terms',
  [KNOWLEDGE_RESOURCE_KEYS.CHARACTERS_MD]: 'characters',
  [KNOWLEDGE_RESOURCE_KEYS.RELATIONSHIPS_MD]: 'relationships',
  [KNOWLEDGE_RESOURCE_KEYS.STORY_STATE_MD]: 'story_state',
  [KNOWLEDGE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD]: 'world_knowledge',
  [KNOWLEDGE_RESOURCE_KEYS.RECENT_CONTEXT_MD]: 'recent_context',
  [KNOWLEDGE_RESOURCE_KEYS.SYNC_STATE_MD]: 'sync_state',
};

/** Write knowledge markdown files for Notebook upload (00_…08_). */
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
