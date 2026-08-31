/**
 * Shared harness for multi-provider acceptance — wires
 * Project → Edition → Job → Scheduler → AiProviderManager.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { initializeDatabase, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { JobService } from '@main/services/job-service';
import { AutomationScheduler } from '@main/jobs/scheduler';
import { AiProviderManager } from '@main/ai/ai-provider-manager';
import type { IAIProvider } from '@main/ai/iai-provider';
import type { AIResponse, SendPromptOptions } from '@main/ai/types';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import type { JobExecuteContext } from '@main/jobs/batch-executor';
import type { LockedTermForQa } from '@main/jobs/qa-checker';
import { browserProfileManager } from '@main/automation/browser-runner/profile-manager';
import { AI_ROUTING_META_KEYS } from '@shared/constants/provider-preflight';
import { AI_FALLBACK_META_KEYS } from '@shared/constants/ai-provider';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { checkProviderForJob } from '@main/ai/provider-preflight';
import type { AiExecutionTarget } from '@main/ai/execution-target';

export const P1 = '[C000001:P000001]';
export const P2 = '[C000001:P000002]';
export const P3 = '[C000001:P000003]';

export const LOCK_TERM = 'XLOCKTERM';
export const LOCK_PREFERRED = 'PreferredLockForm';

export interface CaptureSink {
  executionTargets: AiExecutionTarget[];
  packs: TranslationPackDto[];
  providerIds: string[];
  sendCounts: Map<string, number>;
}

export interface PipelineHarness {
  db: DatabaseManager;
  service: JobService;
  manager: AiProviderManager;
  scheduler: AutomationScheduler;
  captures: CaptureSink;
  tempRoot: string;
  dispose: () => Promise<void>;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(predicate: () => boolean, timeoutMs = 12_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await sleep(25);
  }
}

export function okTranslateResponse(
  ids: string[],
  lines?: string[],
): string {
  return [
    '<TRANSLATION>',
    ...ids.map((id, i) => `${id} ${lines?.[i] ?? `Translated line ${i + 1}.`}`),
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

export function missingLastParagraph(ids: string[]): string {
  const head = ids.slice(0, -1);
  return okTranslateResponse(head);
}

export function seedGoogleAccount(
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

export function seedBrowserAiAccount(
  db: DatabaseManager,
  providerId: string,
  profileDir: string,
  label: string,
  status: 'READY' | 'LOGIN_REQUIRED' = 'READY',
): string {
  db.aiProviders.setEnabled(providerId, true);
  const account = db.aiAccounts.create({
    provider_id: providerId,
    session_location: 'browser',
    profile_dir_name: profileDir,
    display_name: label,
    status,
  });
  fs.mkdirSync(browserProfileManager.resolveProfilePath(profileDir), { recursive: true });
  return account.id;
}

export function pinProjectProvider(
  db: DatabaseManager,
  projectId: string,
  providerId: string,
): void {
  db.projects.setStyleConfig(projectId, JSON.stringify({ primaryProviderId: providerId }));
}

export function seedProject(
  db: DatabaseManager,
  input: {
    title: string;
    sourceLanguage: string;
    target_language: string;
    lockedTerm?: { source: string; preferred: string };
  },
): { projectId: string; editionId: string; chapterId: string } {
  const project = db.projects.create({
    title: input.title,
    source_language: input.sourceLanguage,
    target_language: input.target_language,
  });
  const edition = ensureDefaultEdition(db, project.id);
  db.projects.update(project.id, { target_language: input.target_language });
  db.translationEditions.update(edition.id, { targetLanguage: input.target_language });

  const chapter = db.chapters.create({
    project_id: project.id,
    chapter_number: 1,
    sequence_order: 1,
    source_text: 'chapter source',
    source_status: 'SOURCE_READY',
  });

  if (input.lockedTerm) {
    db.terms.create({
      source_text: input.lockedTerm.source,
      source_simplified: input.lockedTerm.source,
      source_language: input.sourceLanguage,
      target_language: input.target_language,
      scope: 'PROJECT',
      scope_ref: project.id,
      status: 'PROJECT_VERIFIED',
      preferred_translation: input.lockedTerm.preferred,
      locked: true,
    });
  }

  return { projectId: project.id, editionId: edition.id, chapterId: chapter.id };
}

export function mockProvider(
  id: string,
  type: IAIProvider['providerType'],
  handler: (pack: TranslationPackDto, opts?: SendPromptOptions) => Promise<AIResponse>,
  captures?: CaptureSink,
): IAIProvider {
  return {
    providerId: id,
    providerType: type,
    initialize: vi.fn(() => Promise.resolve()),
    healthCheck: vi.fn(() =>
      Promise.resolve({ ok: true, status: 'READY' as const, message: 'ok' }),
    ),
    sendPrompt: vi.fn((pack: TranslationPackDto, opts?: SendPromptOptions) => {
      captures?.packs.push(pack);
      captures?.providerIds.push(id);
      captures?.sendCounts.set(id, (captures?.sendCounts.get(id) ?? 0) + 1);
      return handler(pack, opts);
    }),
    cancelRequest: vi.fn(() => Promise.resolve()),
    getStatus: vi.fn(() =>
      Promise.resolve({
        providerId: id,
        type,
        ready: true,
        message: 'ok',
      }),
    ),
    close: vi.fn(() => Promise.resolve()),
  };
}

export function enablePreflightReady(): void {
  vi.mocked(checkProviderForJob).mockImplementation(async (_db, input) => ({
    providerId: input.providerId,
    result: 'READY',
    message: 'ok',
    checks: {},
  }));
}

export async function createPipelineHarness(
  options?: {
    maxConcurrentWorkers?: number;
    buildProviders?: (captures: CaptureSink) => IAIProvider[];
    routingMode?: 'AUTO' | 'PIN';
  },
): Promise<PipelineHarness> {
  enablePreflightReady();

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-mp-accept-'));
  pathsService.initializeAt(tempRoot);
  const paths = resolveAppPaths(tempRoot);
  fs.mkdirSync(paths.browserProfiles, { recursive: true });
  closeDatabase();
  const db = initializeDatabase({ dataDir: paths.data, backupsDir: paths.backups });

  const captures: CaptureSink = {
    executionTargets: [],
    packs: [],
    providerIds: [],
    sendCounts: new Map(),
  };

  const manager = new AiProviderManager(db);
  for (const provider of options?.buildProviders?.(captures) ?? []) {
    db.aiProviders.setEnabled(provider.providerId, true);
    manager.register(provider);
  }

  if (options?.routingMode) {
    db.appMeta.set(AI_ROUTING_META_KEYS.mode, options.routingMode);
  }
  db.appMeta.set(AI_FALLBACK_META_KEYS.enabled, '1');

  const service = new JobService(db);
  const scheduler = new AutomationScheduler(db, {
    maxConcurrentWorkers: options?.maxConcurrentWorkers ?? 2,
    tickMs: 40,
    sendInitial: async (ctx: JobExecuteContext) => {
      captures.executionTargets.push({ ...ctx.executionTarget });
      return manager.sendForJob(ctx);
    },
    sendRepair: (req) => manager.sendRepair(req),
  });
  service.attachScheduler(scheduler);

  return {
    db,
    service,
    manager,
    scheduler,
    captures,
    tempRoot,
    dispose: async () => {
      await scheduler.stop({ waitMs: 2_000 });
      db.close();
      closeDatabase();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

export async function runTranslateJob(
  harness: PipelineHarness,
  input: {
    projectId: string;
    batchParagraphs: { paragraphId: string; sourceText: string }[];
    sourceParagraphIds: string[];
    lockedTerms?: LockedTermForQa[];
    chapterFrom?: number;
    chapterTo?: number;
  },
): Promise<string> {
  harness.scheduler.start();
  const { job } = harness.service.enqueueTranslate({
    projectId: input.projectId,
    chapterFrom: input.chapterFrom ?? 1,
    chapterTo: input.chapterTo ?? 1,
    sourceParagraphIds: input.sourceParagraphIds,
    batchParagraphs: input.batchParagraphs,
    lockedTerms: input.lockedTerms,
  });
  await waitFor(() => harness.db.jobs.getById(job.id)?.state === 'COMPLETED');
  return job.id;
}
