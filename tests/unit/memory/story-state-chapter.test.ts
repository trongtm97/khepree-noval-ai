import { describe, expect, it } from 'vitest';
import { StoryStateDtoSchema } from '@shared/schemas/memory';
import { newId } from '@main/db/utils/uuid';
import {
  normalizeStoryChapterNumber,
  toStoryStateDto,
} from '@main/services/memory-dto';
import type { StoryStateRow } from '@main/db/repositories/story-state-repository';

function row(overrides: Partial<StoryStateRow> = {}): StoryStateRow {
  const now = new Date().toISOString();
  return {
    id: newId(),
    project_id: newId(),
    current_chapter_number: null,
    state_json: null,
    summary_text: null,
    cultivation_state: null,
    location_state: null,
    important_items: null,
    unresolved_plot_points: null,
    world_knowledge_json: null,
    locked: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('story state chapter number', () => {
  it('treats 0 and negative as unset', () => {
    expect(normalizeStoryChapterNumber(0)).toBeNull();
    expect(normalizeStoryChapterNumber(-1)).toBeNull();
    expect(normalizeStoryChapterNumber(null)).toBeNull();
    expect(normalizeStoryChapterNumber(12)).toBe(12);
  });

  it('DTO maps DB zero so IPC StoryStateDtoSchema accepts it', () => {
    const dto = toStoryStateDto(row({ current_chapter_number: 0 }), {
      currentChapterNumber: 0,
    });
    expect(dto.currentChapterNumber).toBeNull();
    expect(() => StoryStateDtoSchema.parse(dto)).not.toThrow();
  });

  it('schema preprocess coerces legacy 0 at the wire boundary', () => {
    const projectId = newId();
    const parsed = StoryStateDtoSchema.parse({
      projectId,
      currentChapterNumber: 0,
      summaryText: null,
      locked: false,
      updatedAt: new Date().toISOString(),
    });
    expect(parsed.currentChapterNumber).toBeNull();
  });
});
