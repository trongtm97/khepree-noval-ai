import { describe, it, expect, vi } from 'vitest';
import type { DatabaseManager } from '@main/db/database-manager';
import { GEMINI_WEB_CHAT_URL } from '@shared/constants/notebook-role';
import {
  healLegacyTranslationNotebookMappings,
  resolvePlaywrightSendTarget,
} from '@main/notebook/playwright-send-target';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ACCOUNT = '22222222-2222-2222-2222-222222222222';

function mockDb(rows: Record<string, unknown>[] = []): {
  db: DatabaseManager;
  markDeprecated: ReturnType<typeof vi.fn>;
  insertKnowledgeSyncEvent: ReturnType<typeof vi.fn>;
} {
  const projectRows = [...rows];
  const markDeprecated = vi.fn((id: string) => {
    const row = projectRows.find((r) => r.id === id);
    if (row) row.deprecated_at = '2026-01-01T00:00:00.000Z';
  });
  const insertKnowledgeSyncEvent = vi.fn();
  const db = {
    notebooks: {
      listByProject: vi.fn(() => projectRows.filter((r) => r.notebook_role === 'TRANSLATION')),
      listByProjectAndWorker: vi.fn(() => projectRows),
      markDeprecated,
      upsert: vi.fn(),
    },
    knowledgeSyncEvents: {
      insert: insertKnowledgeSyncEvent,
      listRecent: vi.fn(() => []),
    },
  } as unknown as DatabaseManager;
  return { db, markDeprecated, insertKnowledgeSyncEvent };
}

describe('playwright-send-target', () => {
  it('local_context ignores legacy TRANSLATION pending — web chat URL', () => {
    const { db } = mockDb([
      {
        id: 'legacy-1',
        notebook_role: 'TRANSLATION',
        status: 'pending',
        deprecated_at: null,
        resource_url: 'https://notebooklm.google.com/notebook/legacy',
      },
    ]);
    const target = resolvePlaywrightSendTarget(db, PROJECT, ACCOUNT, 'local_context');
    expect(target.notebookUrl).toBe(GEMINI_WEB_CHAT_URL);
    expect(target.notebookRowId).toBeNull();
    expect(target.usedWebChatFallback).toBe(true);
  });

  it('healLegacyTranslationNotebookMappings deprecates stuck TRANSLATION rows', () => {
    const { db, markDeprecated, insertKnowledgeSyncEvent } = mockDb([
      {
        id: 'legacy-1',
        notebook_role: 'TRANSLATION',
        status: 'error',
        deprecated_at: null,
      },
    ]);
    expect(healLegacyTranslationNotebookMappings(db, PROJECT)).toBe(1);
    expect(markDeprecated).toHaveBeenCalledWith('legacy-1');
    expect(insertKnowledgeSyncEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'NOTEBOOK_LEGACY_DEPRECATED' }),
    );
  });

  it('notebook_assisted uses ready SINGLE mapping', () => {
    const { db } = mockDb([
      {
        id: 'single-1',
        notebook_role: 'SINGLE',
        status: 'ready',
        deprecated_at: null,
        resource_url: 'https://notebooklm.google.com/notebook/single',
      },
    ]);
    const target = resolvePlaywrightSendTarget(db, PROJECT, ACCOUNT, 'notebook_assisted');
    expect(target.notebookUrl).toBe('https://notebooklm.google.com/notebook/single');
    expect(target.notebookRowId).toBe('single-1');
    expect(target.usedWebChatFallback).toBe(false);
  });
});
