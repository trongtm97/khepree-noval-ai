import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiService } from '@main/services/gemini-service';
import type { DatabaseManager } from '@main/db/database-manager';

vi.mock('@main/services/notebook-send-readiness-singleton', () => ({
  getNotebookSendReadinessService: vi.fn(),
}));

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ACCOUNT = '22222222-2222-2222-2222-222222222222';

function mockDb(): DatabaseManager {
  return {
    projects: {
      getById: vi.fn(() => ({ id: PROJECT, title: 'Novel' })),
    },
    googleAccounts: {
      getById: vi.fn(() => ({ id: ACCOUNT })),
    },
    knowledgeSyncEvents: { insert: vi.fn() },
  } as unknown as DatabaseManager;
}

describe('GeminiService notebook legacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns NEEDS_ASSISTED when readiness not ok — no legacy throw', async () => {
    const { getNotebookSendReadinessService } = await import(
      '@main/services/notebook-send-readiness-singleton'
    );
    vi.mocked(getNotebookSendReadinessService).mockReturnValue({
      ensureForSend: vi.fn(() =>
        Promise.resolve({
          ok: false,
          needsAssisted: true,
          message: 'NotebookLM chưa sẵn sàng',
          notebookUrl: 'https://gemini.google.com/app',
          notebookRowId: null,
          mapping: null,
          usedWebChatFallback: false,
        }),
      ),
    } as never);

    const db = mockDb();
    const svc = new GeminiService(db);
    const pack = {
      projectId: PROJECT,
      promptHash: 'hash',
    } as import('@shared/schemas/translation-pack').TranslationPackDto;

    const result = await svc.sendTranslation({
      projectId: PROJECT,
      accountId: ACCOUNT,
      pack,
      packMode: 'notebook_assisted',
    });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('NEEDS_ASSISTED');
    expect(result.errorMessage).toContain('NotebookLM');
  });

  it('ensureForSend invoked with packMode — legacy throw path removed', async () => {
    const ensureForSend = vi.fn(() =>
      Promise.resolve({
        ok: false,
        needsAssisted: true,
        message: 'setup',
        notebookUrl: 'https://gemini.google.com/app',
        notebookRowId: null,
        mapping: null,
        usedWebChatFallback: true,
      }),
    );
    const { getNotebookSendReadinessService } = await import(
      '@main/services/notebook-send-readiness-singleton'
    );
    vi.mocked(getNotebookSendReadinessService).mockReturnValue({
      ensureForSend,
    } as never);

    const db = mockDb();
    const svc = new GeminiService(db);
    const pack = {
      projectId: PROJECT,
      promptHash: 'hash',
    } as import('@shared/schemas/translation-pack').TranslationPackDto;

    await svc.sendTranslation({
      projectId: PROJECT,
      accountId: ACCOUNT,
      pack,
      packMode: 'local_context',
    });
    expect(ensureForSend).toHaveBeenCalledWith({
      projectId: PROJECT,
      accountId: ACCOUNT,
      packMode: 'local_context',
    });
  });
});
