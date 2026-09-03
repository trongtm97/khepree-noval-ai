/**
 * Provider-neutral execution worker matrix (Phase 1 P0).
 * Critical: ChatGPT/Meta jobs must run with ZERO Google accounts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { JobService } from '@main/services/job-service';
import { AutomationScheduler } from '@main/jobs/scheduler';
import { browserProfileManager } from '@main/automation/browser-runner/profile-manager';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { AI_ROUTING_META_KEYS } from '@shared/constants/provider-preflight';
import { buildSendPromptOptions } from '@main/ai/execution-target';
import { AiExecutionWorkerResolver } from '@main/ai/execution-worker-resolver';

const P1 = '[C000001:P000001]';
const P2 = '[C000001:P000002]';
const batch = [
  { paragraphId: P1, sourceText: '第一段' },
  { paragraphId: P2, sourceText: '第二段' },
];

function okResponse(): string {
  return [
    '<TRANSLATION>',
    `${P1} Đoạn một.`,
    `${P2} Đoạn hai.`,
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 8_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await sleep(25);
  }
}

function seedGoogleAccount(
  db: DatabaseManager,
  label: string,
  dirName: string,
): { accountId: string; workerId: string } {
  const account = db.googleAccounts.create({
    label,
    email: `${label}@example.com`,
    profileDirName: dirName,
    status: 'READY',
  });
  fs.mkdirSync(browserProfileManager.resolveProfilePath(dirName), { recursive: true });
  const worker = db.workerStates.getByAccountId(account.id);
  if (!worker) throw new Error('worker_states missing');
  db.workerStates.setHealth(worker.id, 'READY');
  return { accountId: account.id, workerId: worker.id };
}

function seedBrowserAiAccount(
  db: DatabaseManager,
  providerId: string,
  profileDir: string,
  label: string,
): string {
  db.aiProviders.setEnabled(providerId, true);
  const account = db.aiAccounts.create({
    provider_id: providerId,
    session_location: 'browser',
    profile_dir_name: profileDir,
    display_name: label,
    status: 'READY',
  });
  fs.mkdirSync(browserProfileManager.resolveProfilePath(profileDir), { recursive: true });
  return account.id;
}

function pinProjectProvider(db: DatabaseManager, projectId: string, providerId: string): void {
  db.projects.setStyleConfig(
    projectId,
    JSON.stringify({ primaryProviderId: providerId }),
  );
}

describe('Execution worker matrix (provider-neutral)', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;
  let service: JobService;
  let scheduler: AutomationScheduler | null = null;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-exec-worker-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.browserProfiles, { recursive: true });
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({ title: 'Exec Worker Novel' }).id;
    service = new JobService(db);
  });

  afterEach(async () => {
    if (scheduler) {
      await scheduler.stop({ waitMs: 2_000 });
      scheduler = null;
    }
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('ZERO Google + ONE READY ChatGPT → translation job runs', async () => {
    const chatgptId = seedBrowserAiAccount(
      db,
      AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      'chatgpt-profile-a',
      'ChatGPT A',
    );
    pinProjectProvider(db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

    const usedTargets: string[] = [];
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 1,
      tickMs: 40,
      sendInitial: (ctx) => {
        usedTargets.push(ctx.executionTarget.workerId);
        expect(ctx.executionTarget.providerId).toBe(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
        expect(ctx.executionTarget.accountKind).toBe('AI_ACCOUNT');
        expect(ctx.executionTarget.accountId).toBe(chatgptId);
        const opts = buildSendPromptOptions(ctx.executionTarget);
        expect(opts.aiAccountId).toBe(chatgptId);
        expect(opts.googleAccountId).toBeNull();
        return Promise.resolve({ rawResponse: okResponse(), inputRef: 'chatgpt-init' });
      },
    });
    service.attachScheduler(scheduler);

    const { job } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    scheduler.start();
    await waitFor(() => db.jobs.getById(job.id)?.state === 'COMPLETED');

    const persisted = db.jobs.getById(job.id);
    expect(persisted?.execution_provider_id).toBe(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
    expect(persisted?.execution_account_kind).toBe('AI_ACCOUNT');
    expect(persisted?.execution_account_id).toBe(chatgptId);
    expect(usedTargets.length).toBe(1);
  });

  it('ZERO Google + ONE READY Meta AI → translation job runs', async () => {
    const metaId = seedBrowserAiAccount(
      db,
      AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
      'meta-profile-a',
      'Meta A',
    );
    pinProjectProvider(db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);

    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 1,
      tickMs: 40,
      sendInitial: (ctx) => {
        expect(ctx.executionTarget.providerId).toBe(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);
        expect(ctx.executionTarget.accountId).toBe(metaId);
        return Promise.resolve({ rawResponse: okResponse(), inputRef: 'meta-init' });
      },
    });
    service.attachScheduler(scheduler);

    const { job } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    scheduler.start();
    await waitFor(() => db.jobs.getById(job.id)?.state === 'COMPLETED');
    expect(db.jobs.getById(job.id)?.execution_account_id).toBe(metaId);
  });

  it('1 Gemini account → schedules Google execution target', async () => {
    const { accountId } = seedGoogleAccount(db, 'gem-a', 'gem-profile-a');
    let seenTarget: string | null = null;
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 1,
      tickMs: 40,
      sendInitial: (ctx) => {
        seenTarget = ctx.executionTarget.accountId;
        return Promise.resolve({ rawResponse: okResponse(), inputRef: 'gem' });
      },
    });
    service.attachScheduler(scheduler);

    const { job } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    scheduler.start();
    await waitFor(() => db.jobs.getById(job.id)?.state === 'COMPLETED', 8_000);
    expect(seenTarget).toBe(accountId);
    expect(db.jobs.getById(job.id)?.execution_account_kind).toBe('GOOGLE_ACCOUNT');
  });

  it('2 ChatGPT accounts → 2 parallel jobs', async () => {
    seedBrowserAiAccount(db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'cgpt-a', 'A');
    seedBrowserAiAccount(db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'cgpt-b', 'B');
    pinProjectProvider(db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

    const projectB = db.projects.create({ title: 'Novel B' }).id;
    pinProjectProvider(db, projectB, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

    const started: string[] = [];
    const gates = new Map<string, () => void>();
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 2,
      concurrencyPolicy: { allowSameProjectParallel: true, perProjectMax: 2 },
      tickMs: 40,
      sendInitial: async (ctx) => {
        started.push(ctx.executionTarget.accountId);
        await new Promise<void>((resolve) => {
          gates.set(ctx.job.id, resolve);
        });
        return { rawResponse: okResponse(), inputRef: 'p' };
      },
    });
    service.attachScheduler(scheduler);

    const { job: j1 } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });
    const { job: j2 } = service.enqueueTranslate({
      projectId: projectB,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    scheduler.start();
    await waitFor(() => started.length === 2);
    expect(new Set(started).size).toBe(2);

    for (const id of [j1.id, j2.id]) gates.get(id)?.();
    await waitFor(
      () =>
        db.jobs.getById(j1.id)?.state === 'COMPLETED' &&
        db.jobs.getById(j2.id)?.state === 'COMPLETED',
    );
  });

  it('ChatGPT + Meta → parallel when both READY', async () => {
    seedBrowserAiAccount(db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'cgpt-par', 'CGPT');
    seedBrowserAiAccount(db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'meta-par', 'Meta');
    db.appMeta.set(AI_ROUTING_META_KEYS.mode, 'AUTO');

    const projectChat = db.projects.create({ title: 'Chat novel' }).id;
    const projectMeta = db.projects.create({ title: 'Meta novel' }).id;
    pinProjectProvider(db, projectChat, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
    pinProjectProvider(db, projectMeta, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);

    const providers: string[] = [];
    const gates = new Map<string, () => void>();
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 2,
      tickMs: 40,
      sendInitial: async (ctx) => {
        providers.push(ctx.executionTarget.providerId);
        await new Promise<void>((r) => gates.set(ctx.job.id, r));
        return { rawResponse: okResponse(), inputRef: 'x' };
      },
    });
    service.attachScheduler(scheduler);

    const { job: jChat } = service.enqueueTranslate({
      projectId: projectChat,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });
    const { job: jMeta } = service.enqueueTranslate({
      projectId: projectMeta,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    scheduler.start();
    await waitFor(() => providers.length === 2);
    expect(providers).toContain(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
    expect(providers).toContain(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);
    gates.get(jChat.id)?.();
    gates.get(jMeta.id)?.();
    await waitFor(
      () =>
        db.jobs.getById(jChat.id)?.state === 'COMPLETED' &&
        db.jobs.getById(jMeta.id)?.state === 'COMPLETED',
    );
  });

  it('resolver lists ChatGPT target without any Google account', () => {
    seedBrowserAiAccount(db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'cgpt-resolver', 'R');
    const resolver = new AiExecutionWorkerResolver(db);
    const targets = resolver.listAvailableTargets({
      projectId,
      preferredProviderId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
    });
    expect(targets.some((t) => t.providerId === AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT)).toBe(
      true,
    );
    expect(targets.every((t) => t.accountKind !== 'GOOGLE_ACCOUNT')).toBe(true);
  });

  it('PIN ChatGPT + login required on ChatGPT → no Meta fallback', () => {
    db.aiProviders.setEnabled(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, true);
    db.aiProviders.setEnabled(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, true);
    db.aiAccounts.create({
      provider_id: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      session_location: 'browser',
      profile_dir_name: 'cgpt-login',
      status: 'LOGIN_REQUIRED',
    });
    seedBrowserAiAccount(db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'meta-fb', 'Meta FB');

    db.appMeta.set(AI_ROUTING_META_KEYS.mode, 'PIN');
    db.appMeta.set(AI_ROUTING_META_KEYS.pinnedProviderId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

    const resolver = new AiExecutionWorkerResolver(db);
    const targets = resolver.listAvailableTargets({
      projectId,
      preferredProviderId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      routingMode: 'PIN',
    });
    expect(targets.length).toBe(0);
  });
});

describe('buildSendPromptOptions', () => {
  it('maps GOOGLE vs AI account fields', () => {
    const google = buildSendPromptOptions({
      workerId: 'w1',
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      providerType: 'PLAYWRIGHT_GEMINI',
      accountKind: 'GOOGLE_ACCOUNT',
      accountId: 'g-1',
      concurrencyKey: 'g-1',
      status: 'READY',
      capabilities: { browserProfile: true, notebookRequired: false, webApiWorker: false },
    });
    expect(google.googleAccountId).toBe('g-1');
    expect(google.aiAccountId).toBeNull();

    const ai = buildSendPromptOptions({
      workerId: 'w2',
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      providerType: 'PLAYWRIGHT_CHATGPT',
      accountKind: 'AI_ACCOUNT',
      accountId: 'ai-1',
      profileDirName: 'prof',
      concurrencyKey: 'ai-1',
      status: 'READY',
      capabilities: { browserProfile: true, notebookRequired: false, webApiWorker: false },
    });
    expect(ai.aiAccountId).toBe('ai-1');
    expect(ai.googleAccountId).toBeNull();
    expect(ai.profileDirName).toBe('prof');
  });
});
