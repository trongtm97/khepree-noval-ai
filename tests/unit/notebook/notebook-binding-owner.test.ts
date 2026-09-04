import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { NotebookBindingService } from '@main/services/notebook-binding-service';
import {
  getNotebookBindingService,
  resetNotebookBindingServiceForTests,
} from '@main/services/notebook-binding-service-singleton';
import {
  FictionSeriesService,
  resetFictionSeriesServiceForTests,
} from '@main/services/fiction-series-service';
import {
  NOTEBOOK_BINDING_FORBIDDEN_OWNER_KINDS,
  NOTEBOOK_BINDING_OWNER_ERROR,
  NOTEBOOK_BINDING_OWNER_KIND,
} from '@shared/constants/notebook-binding-owner';
import type { NotebookProvider } from '@main/automation/providers/google/notebook-provider';

/**
 * HARD REQUIREMENT 15 — series/campaign/job/chapter must not own NotebookLM.
 * Binding owner = story/project only.
 */
describe('HR15 notebook owner is story/project only', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-own-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetNotebookBindingServiceForTests();
    resetFictionSeriesServiceForTests();
  });

  afterEach(() => {
    resetNotebookBindingServiceForTests();
    resetFictionSeriesServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('documents forbidden owner kinds', () => {
    expect(NOTEBOOK_BINDING_OWNER_KIND).toBe('story_project');
    expect(NOTEBOOK_BINDING_FORBIDDEN_OWNER_KINDS).toEqual([
      'seriesId',
      'campaignId',
      'jobId',
      'chapterId',
    ]);
  });

  it('refuses persistBinding when id is not a project (e.g. seriesId mistaken as owner)', () => {
    const db = getDatabase();
    const seriesSvc = new FictionSeriesService(() => db);
    const series = seriesSvc.createSeries({ title: 'Shared World' });
    const account = db.googleAccounts.create({
      label: 'W',
      email: 'w@test.com',
      displayName: 'W',
      profileDirName: 'profile-own',
    });

    const svc = getNotebookBindingService();
    expect(() =>
      svc.persistBinding({
        projectId: series.id, // NOT a project — series must not own NotebookLM
        accountId: account.id,
        notebookName: '[Khepree] Wrong',
        role: 'SINGLE',
        notebookId: 'should-not-exist',
        status: 'ready',
      }),
    ).toThrow(NOTEBOOK_BINDING_OWNER_ERROR);

    expect(db.notebooks.listByProject(series.id)).toHaveLength(0);
  });

  it('two stories in one series each keep their own project-scoped binding', () => {
    const db = getDatabase();
    const seriesSvc = new FictionSeriesService(() => db);
    const series = seriesSvc.createSeries({ title: 'Shared Series' });
    const p1 = db.projects.create({ title: 'Vol 1' });
    const p2 = db.projects.create({ title: 'Vol 2' });
    seriesSvc.assignProjectToSeries({
      projectId: p1.id,
      seriesId: series.id,
      force: true,
    });
    seriesSvc.assignProjectToSeries({
      projectId: p2.id,
      seriesId: series.id,
      force: true,
    });

    const account = db.googleAccounts.create({
      label: 'S',
      email: 's@test.com',
      displayName: 'S',
      profileDirName: 'profile-series',
    });
    const svc = getNotebookBindingService();

    svc.persistBinding({
      projectId: p1.id,
      accountId: account.id,
      notebookName: '[Khepree] Vol 1',
      role: 'SINGLE',
      notebookId: 'nb-vol-1',
      notebookUrl: 'https://notebook.google.com/n/nb-vol-1',
      status: 'ready',
    });
    svc.persistBinding({
      projectId: p2.id,
      accountId: account.id,
      notebookName: '[Khepree] Vol 2',
      role: 'SINGLE',
      notebookId: 'nb-vol-2',
      notebookUrl: 'https://notebook.google.com/n/nb-vol-2',
      status: 'ready',
    });

    expect(svc.getNotebookForStory(p1.id)?.notebookId).toBe('nb-vol-1');
    expect(svc.getNotebookForStory(p2.id)?.notebookId).toBe('nb-vol-2');
    expect(svc.getNotebookForStory(series.id)).toBeNull();
    expect(db.notebooks.listByProject(series.id)).toHaveLength(0);
  });

  it('getOrCreate rejects non-project owner before any create', async () => {
    const db = getDatabase();
    const series = new FictionSeriesService(() => db).createSeries({
      title: 'No Notebook',
    });
    const account = db.googleAccounts.create({
      label: 'X',
      email: 'x@test.com',
      displayName: 'X',
      profileDirName: 'profile-x',
    });
    const ensureCalls: string[] = [];
    const provider = {
      findNotebookByName: async () => null,
      ensureNotebook: async (name: string) => {
        ensureCalls.push(name);
        return { name, id: 'x', url: 'https://notebook.google.com/n/x' };
      },
      openNotebook: async (name: string) => ({
        name,
        id: 'x',
        url: 'https://notebook.google.com/n/x',
      }),
    } as unknown as NotebookProvider;
    const page = {
      url: () => 'https://notebook.google.com/',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;

    await expect(
      new NotebookBindingService(db).getOrCreateNotebookBinding({
        projectId: series.id,
        accountId: account.id,
        preferredName: '[Khepree] No',
        role: 'SINGLE',
        provider,
        page,
      }),
    ).rejects.toThrow(NOTEBOOK_BINDING_OWNER_ERROR);
    expect(ensureCalls).toHaveLength(0);
  });
});

describe('HR15 — no production API takes series/campaign/job/chapter as notebook owner', () => {
  const root = path.resolve(__dirname, '../../../src/main');

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  it('getOrCreateNotebookBinding / persistBinding call sites pass projectId not seriesId', () => {
    const offenders: string[] = [];
    const call =
      /(?:getOrCreateNotebookBinding|persistBinding|reuseNotebookBindingForRetry)\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
    for (const file of walk(root)) {
      if (file.includes('notebook-binding-service.ts')) continue;
      const text = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = call.exec(text))) {
        const body = m[1] ?? '';
        if (
          /projectId\s*:\s*seriesId/.test(body) ||
          /projectId\s*:\s*campaignId/.test(body) ||
          /projectId\s*:\s*jobId/.test(body) ||
          /projectId\s*:\s*chapterId/.test(body) ||
          /projectId\s*:\s*input\.seriesId/.test(body)
        ) {
          offenders.push(path.relative(root, file).replace(/\\/g, '/'));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
