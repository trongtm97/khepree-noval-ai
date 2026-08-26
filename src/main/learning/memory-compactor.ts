import {
  DEFAULT_MEMORY_ARCHIVE_CHAPTER_WINDOW,
  DEFAULT_MEMORY_EVENT_SOFT_CAP,
  DEFAULT_STORY_SUMMARY_MAX_CHARS,
} from '@shared/constants/learning';
import type { DatabaseManager } from '../db/database-manager';
import { withTransaction } from '../db/transaction';

export interface CompactMemoryResult {
  archivedEvents: number;
  archiveId: string | null;
  storyTrimmed: boolean;
}

/**
 * Archive historical memory_events so current state stays compact.
 * Locked events are never archived.
 */
export function compactProjectMemory(
  db: DatabaseManager,
  projectId: string,
  options?: {
    currentChapter?: number | null;
    chapterWindow?: number;
    softCap?: number;
    summaryMaxChars?: number;
  },
): CompactMemoryResult {
  const window = options?.chapterWindow ?? DEFAULT_MEMORY_ARCHIVE_CHAPTER_WINDOW;
  const softCap = options?.softCap ?? DEFAULT_MEMORY_EVENT_SOFT_CAP;
  const summaryMax = options?.summaryMaxChars ?? DEFAULT_STORY_SUMMARY_MAX_CHARS;

  const story = db.storyStates.getByProject(projectId);
  const currentChapter =
    options?.currentChapter ?? story?.current_chapter_number ?? null;

  let archivedEvents = 0;
  let archiveId: string | null = null;
  let storyTrimmed = false;

  withTransaction(db.getConnection(), () => {
    const total = db.memoryEvents.countByProject(projectId);
    const cutoff =
      currentChapter != null && currentChapter > window
        ? currentChapter - window
        : null;

    let toArchive =
      cutoff != null ? db.memoryEvents.listOlderThanChapter(projectId, cutoff) : [];

    if (toArchive.length === 0 && total > softCap) {
      // Soft-cap: archive oldest unlocked by updated_at
      const all = db.memoryEvents.listByProject(projectId);
      const unlocked = all.filter((e) => e.locked === 0);
      const excess = unlocked.length - softCap;
      if (excess > 0) {
        toArchive = unlocked.slice(-excess).reverse();
      }
    }

    if (toArchive.length > 0) {
      const chapters = toArchive
        .map((e) => e.chapter_number)
        .filter((n): n is number => n != null);
      const archive = db.memoryArchives.create({
        project_id: projectId,
        archive_kind: 'memory_events',
        chapter_from: chapters.length ? Math.min(...chapters) : null,
        chapter_to: chapters.length ? Math.max(...chapters) : null,
        content_json: JSON.stringify(toArchive),
        item_count: toArchive.length,
      });
      archiveId = archive.id;
      archivedEvents = db.memoryEvents.deleteByIds(toArchive.map((e) => e.id));
      db.learningEvents.create({
        project_id: projectId,
        event_type: 'memory_archive',
        payload: {
          archiveId,
          archivedEvents,
          chapterFrom: archive.chapter_from,
          chapterTo: archive.chapter_to,
        },
      });
    }

    // Compact story summary if oversized (archive full text first)
    if (story?.summary_text && story.summary_text.length > summaryMax) {
      db.memoryArchives.create({
        project_id: projectId,
        archive_kind: 'story_summary',
        chapter_from: story.current_chapter_number,
        chapter_to: story.current_chapter_number,
        content_json: JSON.stringify({ summary_text: story.summary_text }),
        item_count: 1,
      });
      const trimmed =
        story.summary_text.slice(0, summaryMax - 20).trimEnd() + '\n…[archived]';
      db.storyStates.patch(projectId, { summaryText: trimmed });
      storyTrimmed = true;
    }
  });

  return { archivedEvents, archiveId, storyTrimmed };
}
