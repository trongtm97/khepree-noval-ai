import type { DatabaseManager } from '../db/database-manager';
import type { MemoryEventRow } from '../db/repositories/memory-event-repository';
import { DEFAULT_RECENT_CHAPTER_WINDOW } from '@shared/constants/memory';

export interface RecentMemorySlice {
  fromChapter: number;
  toChapter: number;
  events: MemoryEventRow[];
}

export function getRecentMemory(
  db: DatabaseManager,
  projectId: string,
  anchorChapter: number,
  window = DEFAULT_RECENT_CHAPTER_WINDOW,
): RecentMemorySlice {
  const fromChapter = Math.max(1, anchorChapter - window + 1);
  const events = db.memoryEvents.listRecentChapters(projectId, fromChapter, anchorChapter);
  return { fromChapter, toChapter: anchorChapter, events };
}
