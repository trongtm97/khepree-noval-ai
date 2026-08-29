import { describe, it, expect, vi } from 'vitest';
import { NotebookSendReadinessService } from '@main/services/notebook-send-readiness-service';
import type { DatabaseManager } from '@main/db/database-manager';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ACCOUNT = '22222222-2222-2222-2222-222222222222';

function mockDb(): DatabaseManager {
  return {
    knowledgeSyncEvents: {
      insert: vi.fn(),
    },
    notebooks: {
      listByProject: vi.fn(() => []),
      listByProjectAndWorker: vi.fn(() => []),
      markDeprecated: vi.fn(),
    },
    projects: {
      getById: vi.fn(() => ({ id: PROJECT })),
    },
  } as unknown as DatabaseManager;
}

describe('NotebookSendReadinessService', () => {
  it('local_context returns ok with web chat fallback', async () => {
    const db = mockDb();
    const svc = new NotebookSendReadinessService(db);
    const result = await svc.ensureForSend({
      projectId: PROJECT,
      accountId: ACCOUNT,
      packMode: 'local_context',
    });
    expect(result.ok).toBe(true);
    expect(result.needsAssisted).toBe(false);
    expect(result.usedWebChatFallback).toBe(true);
    expect(result.notebookUrl).toContain('gemini.google.com');
  });

  it('notebook_assisted pending triggers provision', async () => {
    const db = mockDb();
    const provision = vi.fn(() =>
      Promise.resolve({
        assisted: false,
        message: 'ready',
        mapping: {
          projectId: PROJECT,
          accountId: ACCOUNT,
          notebookName: 'NB',
          notebookRole: 'SINGLE',
          notebookId: 'nb-1',
          resourceUrl: 'https://notebooklm.google.com/notebook/x',
          status: 'ready',
          assistedStep: null,
          lastError: null,
          lastVerifiedAt: null,
        },
      }),
    );

    (db.notebooks.listByProjectAndWorker as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 'row-1',
        notebook_role: 'SINGLE',
        status: 'pending',
        deprecated_at: null,
        resource_url: null,
      },
    ]);

    const svc = new NotebookSendReadinessService(db, { provision });
    const result = await svc.ensureForSend({
      projectId: PROJECT,
      accountId: ACCOUNT,
      packMode: 'notebook_assisted',
    });
    expect(provision).toHaveBeenCalledWith({
      projectId: PROJECT,
      accountId: ACCOUNT,
      role: 'SINGLE',
    });
    expect(result.ok).toBe(false);
    expect(result.needsAssisted).toBe(true);
  });

  it('notebook_assisted assisted provision returns needsAssisted', async () => {
    const db = mockDb();
    const provision = vi.fn(() =>
      Promise.resolve({
        assisted: true,
        message: 'Hoàn tất trong trình duyệt',
        mapping: {
          projectId: PROJECT,
          accountId: ACCOUNT,
          notebookName: 'NB',
          notebookRole: 'SINGLE',
          notebookId: null,
          resourceUrl: null,
          status: 'assisted_setup',
          assistedStep: 'create_notebook',
          lastError: null,
          lastVerifiedAt: null,
        },
      }),
    );
    const openBrowser = vi.fn(() => Promise.resolve());

    const svc = new NotebookSendReadinessService(db, { provision, openBrowser });
    const result = await svc.ensureForSend({
      projectId: PROJECT,
      accountId: ACCOUNT,
      packMode: 'notebook_assisted',
    });
    expect(result.ok).toBe(false);
    expect(result.needsAssisted).toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(ACCOUNT, 'notebook');
  });
});
