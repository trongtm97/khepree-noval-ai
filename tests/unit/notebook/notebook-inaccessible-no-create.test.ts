import { describe, expect, it, vi } from 'vitest';
import {
  NOTEBOOK_BINDING_ACCESS_ACTIONS,
  NOTEBOOK_BINDING_INACCESSIBLE_USER_MESSAGE_VI,
  notebookBindingInaccessiblePayload,
} from '@shared/constants/notebook-binding-access';
import { NotebookBindingService } from '@main/services/notebook-binding-service';
import type { NotebookProvider } from '@main/automation/providers/google/notebook-provider';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { resetNotebookBindingServiceForTests } from '@main/services/notebook-binding-service-singleton';

describe('HR13 inaccessible binding — never create another notebook', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-hr13-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetNotebookBindingServiceForTests();
  });

  afterEach(() => {
    resetNotebookBindingServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('payload exposes VI user message + reconnect actions; technical separate', () => {
    const payload = notebookBindingInaccessiblePayload('SELECTOR_NOT_FOUND: createNotebookButton');
    expect(payload.userMessage).toBe(NOTEBOOK_BINDING_INACCESSIBLE_USER_MESSAGE_VI);
    expect(payload.technicalDetail).toContain('SELECTOR_NOT_FOUND');
    expect(payload.actions).toEqual([...NOTEBOOK_BINDING_ACCESS_ACTIONS]);
    expect(payload.userMessage).not.toContain('SELECTOR_NOT_FOUND');
  });

  it('access failure returns needs_reconnect with userMessage — ensureNotebook never called', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'HR13 Novel' });
    const account = db.googleAccounts.create({
      label: 'H',
      email: 'h@test.com',
      displayName: 'H',
      profileDirName: 'profile-hr13',
    });
    const svc = new NotebookBindingService(db);
    svc.persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] HR13',
      role: 'SINGLE',
      notebookId: 'bound-hr13',
      notebookUrl: null,
      status: 'ready',
    });

    const ensure = vi.fn(async () => {
      throw new Error('must not create');
    });
    const provider = {
      findNotebookByName: async () => null,
      ensureNotebook: ensure,
      openNotebook: async () => {
        throw new Error('unreachable');
      },
    } as unknown as NotebookProvider;
    const page = {
      url: () => 'https://notebook.google.com/',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;

    const result = await svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] HR13',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('needs_reconnect');
    if (result.outcome !== 'needs_reconnect') return;
    expect(result.created).toBe(false);
    expect(result.userMessage).toBe(NOTEBOOK_BINDING_INACCESSIBLE_USER_MESSAGE_VI);
    expect(result.technicalDetail).toMatch(/reconnect|refusing|not found/i);
    expect(result.actions).toEqual(['retry_connect', 'open_notebook', 'relink_notebook']);
    expect(result.binding.notebookId).toBe('bound-hr13');
    expect(result.binding.status).toBe('unavailable');
    expect(ensure).not.toHaveBeenCalled();
    expect(db.notebooks.listByProject(project.id)).toHaveLength(1);
  });
});
