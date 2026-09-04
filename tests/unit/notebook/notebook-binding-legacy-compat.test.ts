import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { toProjectDto } from '@main/services/project-dto';
import {
  getNotebookBindingService,
  resetNotebookBindingServiceForTests,
} from '@main/services/notebook-binding-service-singleton';
import { NotebookSendReadinessService } from '@main/services/notebook-send-readiness-service';
import { NotebookBindingSchema } from '@shared/schemas/notebook';
import { NOTEBOOK_BINDING_PERSISTED_KEYS } from '@shared/constants/notebook-binding-compat';
import { coerceNotebookRole } from '@shared/constants/notebook-role';
import type { NotebookProvider } from '@main/automation/providers/google/notebook-provider';
import { runMigration058NotebookBindingCompat } from '@main/db/migrations/058-notebook-binding-compat';

/**
 * HARD REQUIREMENT 18 — do not break existing user data.
 *
 * Legacy story without binding stays valid.
 * Binding created only when NotebookLM is needed, then reused.
 */
describe('HR18 notebook binding legacy compatibility', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-hr18-'));
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

  it('keeps canonical persisted column key names', () => {
    expect(NOTEBOOK_BINDING_PERSISTED_KEYS).toEqual(
      expect.arrayContaining([
        'project_id',
        'notebook_id',
        'resource_url',
        'notebook_role',
        'status',
        'created_at',
        'last_verified_at',
      ]),
    );
  });

  it('legacy unbound story: project DTO opens; resolve returns null; no row invented', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Legacy Story' });

    expect(db.notebooks.listByProject(project.id)).toHaveLength(0);
    expect(getNotebookBindingService().getNotebookForStory(project.id)).toBeNull();
    expect(
      getNotebookBindingService().resolveNotebookForProductionJob(project.id),
    ).toBeNull();

    const dto = toProjectDto(project, 0);
    expect(dto.id).toBe(project.id);
    expect(dto.title).toBe('Legacy Story');
    expect(db.notebooks.listByProject(project.id)).toHaveLength(0);
  });

  it('local_context send readiness does not create binding for unbound story', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Local Only' });
    const account = db.googleAccounts.create({
      label: 'L',
      email: 'l@test.com',
      displayName: 'L',
      profileDirName: 'profile-local',
    });

    const provision = vi.fn();
    const resume = vi.fn();
    const svc = new NotebookSendReadinessService(db, {
      provision,
      resumeAssisted: resume,
    });

    const result = await svc.ensureForSend({
      projectId: project.id,
      accountId: account.id,
      packMode: 'local_context',
    });

    expect(result.ok).toBe(true);
    expect(result.usedWebChatFallback).toBe(true);
    expect(provision).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(db.notebooks.listByProject(project.id)).toHaveLength(0);
    expect(getNotebookBindingService().getNotebookForStory(project.id)).toBeNull();
  });

  it('creates binding only when NotebookLM needed, then reuses same remote id', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Needs NB' });
    const account = db.googleAccounts.create({
      label: 'N',
      email: 'n@test.com',
      displayName: 'N',
      profileDirName: 'profile-nb',
    });
    const svc = getNotebookBindingService();
    expect(svc.getNotebookForStory(project.id)).toBeNull();

    const ensure = vi.fn(async (name: string) => ({
      name,
      id: 'notebook-legacy-A',
      url: 'https://notebook.google.com/n/notebook-legacy-A',
    }));
    const provider = {
      findNotebookByName: async () => null,
      ensureNotebook: ensure,
      openNotebook: async (name: string) => ({
        name,
        id: 'notebook-legacy-A',
        url: 'https://notebook.google.com/n/notebook-legacy-A',
      }),
    } as unknown as NotebookProvider;
    const page = {
      url: () => 'https://notebook.google.com/',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;

    const created = await svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Needs NB',
      role: 'SINGLE',
      provider,
      page,
    });
    expect(created.outcome).toBe('created');
    expect(created.binding.notebookId).toBe('notebook-legacy-A');
    expect(ensure).toHaveBeenCalledTimes(1);

    const again = await svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Needs NB',
      role: 'SINGLE',
      provider,
      page,
    });
    expect(again.outcome).toBe('reused');
    expect(again.binding.notebookId).toBe('notebook-legacy-A');
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it('schema tolerates partial / unknown-role legacy shapes', () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    const parsed = NotebookBindingSchema.parse({
      projectId,
      notebookId: null,
      role: 'WEIRD_LEGACY',
    });
    expect(parsed.notebookId).toBeNull();
    expect(parsed.accountId).toBeNull();
    expect(parsed.role).toBe(coerceNotebookRole('WEIRD_LEGACY'));
    expect(parsed.status).toBe('pending');
    expect(parsed.createdAt).toBeTruthy();
  });

  it('migration 058 normalizes empty role/status and does not invent bindings', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Empty Role' });
    const account = db.googleAccounts.create({
      label: 'E',
      email: 'e@test.com',
      displayName: 'E',
      profileDirName: 'profile-empty',
    });
    const row = db.notebooks.upsert({
      project_id: project.id,
      google_account_id: account.id,
      notebook_name: '[Khepree] Empty Role',
      notebook_role: 'SINGLE',
      notebook_id: 'nb-empty',
      status: 'ready',
    });
    // Simulate corrupted / pre-migration empty strings via raw SQL.
    const raw = db.getConnection();
    raw
      .prepare(
        `UPDATE notebook_resources SET notebook_role = '', status = '' WHERE id = ?`,
      )
      .run(row.id);

    const unbound = db.projects.create({ title: 'Still Unbound' });
    const beforeCount = (
      raw.prepare(`SELECT COUNT(*) AS n FROM notebook_resources`).get() as {
        n: number;
      }
    ).n;

    runMigration058NotebookBindingCompat(raw);

    const after = db.notebooks.getById(row.id)!;
    expect(after.notebook_role).toBe('SINGLE');
    expect(after.status).toBe('pending');
    expect(db.notebooks.listByProject(unbound.id)).toHaveLength(0);

    const afterCount = (
      raw.prepare(`SELECT COUNT(*) AS n FROM notebook_resources`).get() as {
        n: number;
      }
    ).n;
    expect(afterCount).toBe(beforeCount);
  });
});
