import type { ChapterRow } from '../db/repositories/chapter-repository';
import type { DetectedChapterFileDto } from '@shared/schemas/source-folder';

export type WatchRawKind = 'add' | 'change' | 'unlink';

export interface WatchRawEvent {
  kind: WatchRawKind;
  filePath: string;
  projectId: string;
}

export type ClassifiedWatchKind = 'new' | 'modified' | 'renamed' | 'deleted' | 'unchanged';

export interface ClassifiedWatchEvent {
  projectId: string;
  kind: ClassifiedWatchKind;
  filePath: string;
  previousPath?: string;
  chapterId?: string;
  chapterNumber?: number;
  detected?: DetectedChapterFileDto;
}

interface CoalescedPathState {
  kinds: WatchRawKind[];
  projectId: string;
}

function coalescePerPath(events: WatchRawEvent[]): Map<string, CoalescedPathState> {
  const map = new Map<string, CoalescedPathState>();
  for (const event of events) {
    const key = event.filePath;
    const existing = map.get(key);
    if (existing) {
      existing.kinds.push(event.kind);
    } else {
      map.set(key, { kinds: [event.kind], projectId: event.projectId });
    }
  }
  return map;
}

export function classifyWatchEvents(input: {
  events: WatchRawEvent[];
  getChapterByPath: (projectId: string, filePath: string) => ChapterRow | null;
  getChapterByNumber: (projectId: string, chapterNumber: number) => ChapterRow | null;
  readDetected: (filePath: string) => DetectedChapterFileDto | null;
}): ClassifiedWatchEvent[] {
  const coalesced = coalescePerPath(input.events);
  const unlinkPaths: Array<{ filePath: string; projectId: string; chapter: ChapterRow | null }> =
    [];
  const addPaths: Array<{
    filePath: string;
    projectId: string;
    detected: DetectedChapterFileDto | null;
  }> = [];
  const changePaths: Array<{
    filePath: string;
    projectId: string;
    detected: DetectedChapterFileDto | null;
  }> = [];

  for (const [filePath, state] of coalesced) {
    const lastKind = state.kinds[state.kinds.length - 1]!;
    const hasUnlink = state.kinds.includes('unlink');
    const hasAdd = state.kinds.includes('add');

    if (hasUnlink && hasAdd && lastKind === 'add') {
      changePaths.push({
        filePath,
        projectId: state.projectId,
        detected: input.readDetected(filePath),
      });
      continue;
    }

    if (lastKind === 'unlink') {
      unlinkPaths.push({
        filePath,
        projectId: state.projectId,
        chapter: input.getChapterByPath(state.projectId, filePath),
      });
      continue;
    }

    if (lastKind === 'add') {
      addPaths.push({
        filePath,
        projectId: state.projectId,
        detected: input.readDetected(filePath),
      });
      continue;
    }

    changePaths.push({
      filePath,
      projectId: state.projectId,
      detected: input.readDetected(filePath),
    });
  }

  const classified: ClassifiedWatchEvent[] = [];
  const pairedAddPaths = new Set<string>();
  const pairedUnlinkPaths = new Set<string>();

  for (const unlink of unlinkPaths) {
    const oldChapter = unlink.chapter;
    if (!oldChapter) continue;

    const match = addPaths.find((add) => {
      if (add.projectId !== unlink.projectId) return false;
      if (!add.detected || add.detected.chapterNumber <= 0) return false;
      if (add.filePath === unlink.filePath) return false;
      if (add.detected.chapterNumber === oldChapter.chapter_number) return true;
      if (
        oldChapter.source_content_hash &&
        add.detected.contentHash === oldChapter.source_content_hash
      ) {
        return true;
      }
      return false;
    });

    if (match) {
      pairedAddPaths.add(match.filePath);
      pairedUnlinkPaths.add(unlink.filePath);
      classified.push({
        projectId: unlink.projectId,
        kind: 'renamed',
        filePath: match.filePath,
        previousPath: unlink.filePath,
        chapterId: oldChapter.id,
        chapterNumber: oldChapter.chapter_number ?? undefined,
        ...(match.detected ? { detected: match.detected } : {}),
      });
    }
  }

  for (const unlink of unlinkPaths) {
    if (pairedUnlinkPaths.has(unlink.filePath)) continue;
    classified.push({
      projectId: unlink.projectId,
      kind: 'deleted',
      filePath: unlink.filePath,
      chapterId: unlink.chapter?.id,
      chapterNumber: unlink.chapter?.chapter_number ?? undefined,
    });
  }

  for (const add of addPaths) {
    if (pairedAddPaths.has(add.filePath)) continue;
    if (!add.detected || add.detected.readError || add.detected.chapterNumber <= 0) continue;

    const byNumber = input.getChapterByNumber(add.projectId, add.detected.chapterNumber);
    if (!byNumber) {
      classified.push({
        projectId: add.projectId,
        kind: 'new',
        filePath: add.filePath,
        chapterNumber: add.detected.chapterNumber,
        detected: add.detected,
      });
      continue;
    }

    if (
      byNumber.source_content_hash &&
      byNumber.source_content_hash === add.detected.contentHash
    ) {
      classified.push({
        projectId: add.projectId,
        kind: 'unchanged',
        filePath: add.filePath,
        chapterId: byNumber.id,
        chapterNumber: add.detected.chapterNumber,
        detected: add.detected,
      });
      continue;
    }

    classified.push({
      projectId: add.projectId,
      kind: 'modified',
      filePath: add.filePath,
      chapterId: byNumber.id,
      chapterNumber: add.detected.chapterNumber,
      detected: add.detected,
    });
  }

  for (const change of changePaths) {
    if (!change.detected || change.detected.readError || change.detected.chapterNumber <= 0) {
      continue;
    }
    const chapter =
      input.getChapterByPath(change.projectId, change.filePath) ??
      input.getChapterByNumber(change.projectId, change.detected.chapterNumber);

    if (!chapter) {
      classified.push({
        projectId: change.projectId,
        kind: 'new',
        filePath: change.filePath,
        chapterNumber: change.detected.chapterNumber,
        detected: change.detected,
      });
      continue;
    }

    if (
      chapter.source_content_hash &&
      chapter.source_content_hash === change.detected.contentHash
    ) {
      classified.push({
        projectId: change.projectId,
        kind: 'unchanged',
        filePath: change.filePath,
        chapterId: chapter.id,
        chapterNumber: change.detected.chapterNumber,
        detected: change.detected,
      });
      continue;
    }

    classified.push({
      projectId: change.projectId,
      kind: 'modified',
      filePath: change.filePath,
      chapterId: chapter.id,
      chapterNumber: change.detected.chapterNumber,
      detected: change.detected,
    });
  }

  return classified;
}
