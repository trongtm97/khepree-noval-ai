import type { TabularDataType } from '@shared/constants/tabular';
import type { KnowledgeDirtyEvent } from '../notebook/notebook-sync-service';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import type { DatabaseManager } from '../db/database-manager';

const DATA_TYPE_DIRTY: Partial<Record<TabularDataType, KnowledgeDirtyEvent[]>> = {
  terms: ['TERM_CHANGED'],
  characters: ['CHARACTER_CHANGED', 'RELATIONSHIP_CHANGED'],
  translations: [],
  project_data: [
    'PROJECT_METADATA_CHANGED',
    'TRANSLATION_RULES_CHANGED',
    'WORLD_KNOWLEDGE_CHANGED',
    'RECENT_CONTEXT_CHANGED',
  ],
};

const SHEET_DIRTY: Record<string, KnowledgeDirtyEvent[]> = {
  PROJECT: ['PROJECT_METADATA_CHANGED'],
  RULES: ['TRANSLATION_RULES_CHANGED'],
  WORLD_KNOWLEDGE: ['WORLD_KNOWLEDGE_CHANGED'],
  STORY_FACTS: ['RECENT_CONTEXT_CHANGED'],
  CHARACTERS: ['CHARACTER_CHANGED'],
  CHARACTER_TRANSLATIONS: ['CHARACTER_CHANGED'],
  RELATIONSHIPS: ['RELATIONSHIP_CHANGED'],
  RELATIONSHIP_RENDERING: ['RELATIONSHIP_CHANGED'],
};

export function markTabularImportDirty(
  db: DatabaseManager,
  input: {
    dataType: TabularDataType;
    projectId?: string;
    committedSheets?: Set<string>;
  },
): void {
  if (!input.projectId) return;
  const sync = getNotebookSyncService(db);
  const events = new Set<KnowledgeDirtyEvent>();

  if (input.committedSheets && input.committedSheets.size > 0) {
    for (const sheet of input.committedSheets) {
      for (const event of SHEET_DIRTY[sheet] ?? []) events.add(event);
    }
  } else {
    for (const event of DATA_TYPE_DIRTY[input.dataType] ?? []) events.add(event);
  }

  for (const event of events) {
    sync.markDirty(input.projectId, event);
  }
}
