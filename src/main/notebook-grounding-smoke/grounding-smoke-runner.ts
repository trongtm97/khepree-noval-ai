/**
 * Real Notebook grounding smoke — Playwright + live NotebookLM.
 * No mocks. Opt-in only (Diagnostics UI or env).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import {
  SYNC_STATE_SOURCE_ALIAS,
  VERSION_PROBE_PROMPT,
  evaluateVersionProbeResponse,
  parseVersionProbeResponse,
} from '@shared/constants/notebook-version-probe';
import { GeminiBrowserProvider } from '../automation/providers/google/gemini-browser-provider';
import { NotebookProvider } from '../automation/providers/google/notebook-provider';
import { BrowserEventLogger } from '../automation/browser-event-logger';
import { launchKhepreeNovelAIPersistentContext } from '../automation/browser-runner/launch-persistent-context';
import { AutomationError } from '../automation/errors/automation-errors';
import type { DatabaseManager } from '../db/database-manager';
import { newId } from '../db/utils/uuid';
import {
  loadNotebookGroundingSmokeConfig,
  parseNotebookGroundingSmokeConfig,
  type GroundingSmokeTestId,
  type NotebookGroundingSmokeConfig,
} from './grounding-smoke-config';
import {
  GLOSSARY_SRC,
  GLOSSARY_VI_V1,
  GLOSSARY_VI_V2,
  STATIC_VALUE_V1,
  buildSlimTranslationPrompt,
  buildSmokeKnowledgeContent,
  buildSmokeSyncStateContent,
  buildStaticGroundingQuestion,
  randomKnowledgeKey,
  responseEqualsExpected,
  responseUsesGlossary,
  sanitizeResponseSnippet,
} from './grounding-smoke-knowledge';
import {
  groundingTestName,
  writeGroundingArtifactsJson,
  writeGroundingReportMarkdown,
  type GroundingSmokeRunReport,
  type GroundingSmokeTestResult,
} from './grounding-smoke-report';

interface Session {
  context: BrowserContext;
  page: Page;
  gemini: GeminiBrowserProvider;
  notebook: NotebookProvider;
  diagnosticsDir: string;
}

interface GroundingState {
  knowledgeKey: string;
  localVersion: number;
  syncNonce: string;
  projectId: string;
  bindingType: 'STATIC';
  knowledgeRemoteId: string | null;
  syncStateRemoteId: string | null;
  notebookName: string | null;
  glossaryVi: string;
  db: DatabaseManager | null;
  smokeCharacterId: string | null;
}

export interface RunNotebookGroundingSmokeOptions {
  configPath?: string;
  config?: NotebookGroundingSmokeConfig;
  /** App DB for Test D learning loop. */
  db?: DatabaseManager | null;
}

export async function runNotebookGroundingSmoke(
  options: RunNotebookGroundingSmokeOptions = {},
): Promise<GroundingSmokeRunReport> {
  const resolved =
    options.config != null
      ? parseNotebookGroundingSmokeConfig(options.config)
      : loadNotebookGroundingSmokeConfig(options.configPath);

  if (!fs.existsSync(resolved.profilePath)) {
    throw new Error(`Profile path does not exist: ${resolved.profilePath}`);
  }

  const artifactsDir = path.resolve(resolved.artifactsDir);
  fs.mkdirSync(artifactsDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const results: GroundingSmokeTestResult[] = [];

  const knowledgeKey = randomKnowledgeKey();
  const projectId = `smoke-grounding-${newId().slice(0, 8)}`;

  let session: Session | null = null;
  const state: GroundingState = {
    knowledgeKey,
    localVersion: 1,
    syncNonce: '',
    projectId,
    bindingType: 'STATIC',
    knowledgeRemoteId: resolved.groundingKnowledgeDriveFileId ?? null,
    syncStateRemoteId: resolved.groundingSyncStateDriveFileId ?? null,
    notebookName: null,
    glossaryVi: GLOSSARY_VI_V1,
    db: options.db ?? null,
    smokeCharacterId: null,
  };

  try {
    session = await openSession(resolved, artifactsDir);
    await session.gemini.openProjectNotebook(resolved.notebookUrl);
    await session.gemini.createOrOpenTranslationThread();
    state.notebookName = await readNotebookName(session);

    // Bootstrap sources once for A–D (local copied text).
    await bootstrapSources(session, resolved, state);

    for (const id of resolved.tests) {
      const result = await runOne(id, resolved, session, state, artifactsDir);
      results.push(result);
      if (result.status === 'FAIL' && (id === 'A' || id === 'B')) {
        // Later tests may still be informative; continue.
      }
    }
  } catch (error) {
    results.push({
      id: 'A',
      name: groundingTestName('A'),
      status: 'FAIL',
      durationMs: 0,
      localVersion: state.localVersion,
      notebookVersion: null,
      bindingType: state.bindingType,
      remoteFileId: state.knowledgeRemoteId,
      notebookName: state.notebookName,
      packMode: 'N/A',
      response: null,
      message: error instanceof Error ? error.message : String(error),
      screenshotPath: null,
    });
  } finally {
    await closeSession(session);
  }

  const finishedAt = new Date().toISOString();
  const executed = results.filter((r) => r.status !== 'SKIP');
  const overall: GroundingSmokeRunReport['overall'] =
    executed.length === 0
      ? 'NOT_RUN'
      : executed.every((r) => r.status === 'PASS')
        ? 'PASS'
        : 'FAIL';

  const report: GroundingSmokeRunReport = {
    startedAt,
    finishedAt,
    overall,
    profilePath: resolved.profilePath,
    notebookUrl: resolved.notebookUrl,
    notebookName: state.notebookName,
    knowledgeKey,
    artifactsDir,
    results,
  };

  writeGroundingArtifactsJson(artifactsDir, report);
  writeGroundingReportMarkdown(path.resolve(resolved.reportMarkdownPath), report);
  return report;
}

async function openSession(
  config: NotebookGroundingSmokeConfig,
  artifactsDir: string,
): Promise<Session> {
  const diagnosticsDir = path.join(artifactsDir, 'diagnostics');
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  const { context } = await launchKhepreeNovelAIPersistentContext({
    profilePath: config.profilePath,
    headless: config.headless,
    diagnosticsDir,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const eventLogger = new BrowserEventLogger(null, path.join(diagnosticsDir, 'events'));
  const gemini = new GeminiBrowserProvider({
    diagnosticsDir,
    eventLogger,
    expectedNotebookUrl: config.notebookUrl,
  });
  gemini.attachPage(page);
  gemini.beginTimeline();
  const notebook = new NotebookProvider({ diagnosticsDir });
  notebook.attachPage(page);
  return { context, page, gemini, notebook, diagnosticsDir };
}

async function closeSession(session: Session | null): Promise<void> {
  if (!session) return;
  await session.gemini.detach().catch(() => undefined);
  await session.context.close().catch(() => undefined);
}

async function readNotebookName(session: Session): Promise<string | null> {
  try {
    const state = await session.notebook.getNotebookState();
    return state.currentName;
  } catch {
    return null;
  }
}

async function bootstrapSources(
  session: Session,
  config: NotebookGroundingSmokeConfig,
  state: GroundingState,
): Promise<void> {
  const sync = buildSmokeSyncStateContent({
    projectId: state.projectId,
    knowledgeVersion: state.localVersion,
  });
  state.syncNonce = sync.syncNonce;

  const knowledge = buildSmokeKnowledgeContent({
    knowledgeKey: state.knowledgeKey,
    knowledgeValue: STATIC_VALUE_V1,
    glossaryVi: state.glossaryVi,
  });

  state.bindingType = 'STATIC';
  await session.notebook.addTextSources([
    { name: config.knowledgeSourceName, content: knowledge },
    { name: config.syncStateSourceName, content: sync.content },
    { name: SYNC_STATE_SOURCE_ALIAS, content: sync.content },
  ]);

  if (state.db) {
    seedSmokeLearningRows(state);
  }

  // Indexing wait via version probe.
  const verified = await waitForNotebookVersion(session, config, state);
  if (!verified.ok) {
    throw new Error(
      `Bootstrap version probe failed: ${verified.reason} (notebook=${verified.notebookVersion ?? '?'})`,
    );
  }
}

function seedSmokeLearningRows(state: GroundingState): void {
  const db = state.db;
  if (!db) throw new Error('Database not initialized');
  let project = db.projects.list().find((p) => p.title.includes('KHEPREE_NOVEL_AI_SMOKE_GROUNDING'));
  project ??= db.projects.create({
      title: 'KHEPREE_NOVEL_AI_SMOKE_GROUNDING',
      source_language: 'zh',
      target_language: 'vi',
      author_name: 'Smoke',
      genre: 'test',
    });
  state.projectId = project.id;

  const existing = db.characters
    .listByProject(project.id)
    .find((c) => c.canonical_name === GLOSSARY_SRC);
  if (existing) {
    db.characters.update(existing.id, { translated_name: GLOSSARY_VI_V1 });
    state.smokeCharacterId = existing.id;
  } else {
    const row = db.characters.create({
      project_id: project.id,
      canonical_name: GLOSSARY_SRC,
      translated_name: GLOSSARY_VI_V1,
      role: 'smoke',
    });
    state.smokeCharacterId = row.id;
  }
}

async function runOne(
  id: GroundingSmokeTestId,
  config: NotebookGroundingSmokeConfig,
  session: Session,
  state: GroundingState,
  artifactsDir: string,
): Promise<GroundingSmokeTestResult> {
  const started = Date.now();
  const base = (): Omit<GroundingSmokeTestResult, 'status' | 'message' | 'durationMs' | 'response' | 'screenshotPath'> => ({
    id,
    name: groundingTestName(id),
    localVersion: state.localVersion,
    notebookVersion: null,
    bindingType: state.bindingType,
    remoteFileId: state.knowledgeRemoteId,
    notebookName: state.notebookName,
    packMode: id === 'C' || id === 'D' ? 'SLIM' : 'N/A',
  });

  try {
    switch (id) {
      case 'A':
        return await testA(session, config, state, started, base);
      case 'B':
        return await testB(session, config, state, started, base);
      case 'C':
        return await testC(session, state, started, base);
      case 'D':
        return await testD(session, config, state, started, base);
      default: {
        const _e: never = id;
        throw new Error(`Unknown test ${_e}`);
      }
    }
  } catch (error) {
    const message =
      error instanceof AutomationError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    const screenshotPath = await captureFailShot(session.page, artifactsDir, id);
    return {
      ...base(),
      status: 'FAIL',
      durationMs: Date.now() - started,
      response: null,
      message,
      screenshotPath,
    };
  }
}

async function testA(
  session: Session,
  config: NotebookGroundingSmokeConfig,
  state: GroundingState,
  started: number,
  base: () => Omit<
    GroundingSmokeTestResult,
    'status' | 'message' | 'durationMs' | 'response' | 'screenshotPath'
  >,
): Promise<GroundingSmokeTestResult> {
  const probe = await waitForNotebookVersion(session, config, state);
  const question = buildStaticGroundingQuestion(state.knowledgeKey);
  if (question.includes(STATIC_VALUE_V1)) {
    throw new Error('Invariant broken: question must not contain knowledge value');
  }
  const raw = await ask(session, question);
  const ok = responseEqualsExpected(raw, STATIC_VALUE_V1);
  return {
    ...base(),
    notebookVersion: probe.notebookVersion,
    status: ok && probe.ok ? 'PASS' : 'FAIL',
    durationMs: Date.now() - started,
    response: sanitizeResponseSnippet(raw),
    message: ok
      ? probe.ok
        ? 'Exact value grounded from Notebook source'
        : `Value OK but version probe weak: ${probe.reason}`
      : `Expected exact "${STATIC_VALUE_V1}", got: ${sanitizeResponseSnippet(raw, 120)}`,
    screenshotPath: null,
    packMode: 'SLIM',
  };
}

async function testB(
  _session: Session,
  _config: NotebookGroundingSmokeConfig,
  _state: GroundingState,
  started: number,
  base: () => Omit<
    GroundingSmokeTestResult,
    'status' | 'message' | 'durationMs' | 'response' | 'screenshotPath'
  >,
): Promise<GroundingSmokeTestResult> {
  return {
    ...base(),
    status: 'SKIP',
    durationMs: Date.now() - started,
    response: null,
    message: 'Test B skipped — Google Drive removed; live update smoke needs file re-upload path.',
    screenshotPath: null,
  };
}

async function testC(
  session: Session,
  state: GroundingState,
  started: number,
  base: () => Omit<
    GroundingSmokeTestResult,
    'status' | 'message' | 'durationMs' | 'response' | 'screenshotPath'
  >,
): Promise<GroundingSmokeTestResult> {
  const chinese = `${GLOSSARY_SRC}拔出长剑。`;
  const prompt = buildSlimTranslationPrompt(chinese);
  if (prompt.includes(GLOSSARY_VI_V1) || prompt.includes(GLOSSARY_VI_V2)) {
    throw new Error('Invariant broken: SLIM prompt must not contain VI glossary');
  }
  if (!prompt.includes(GLOSSARY_SRC)) {
    throw new Error('Invariant broken: SLIM prompt must contain Chinese source term');
  }
  const raw = await ask(session, prompt);
  const ok = responseUsesGlossary(raw, state.glossaryVi);
  return {
    ...base(),
    notebookVersion: state.localVersion,
    status: ok ? 'PASS' : 'FAIL',
    durationMs: Date.now() - started,
    response: sanitizeResponseSnippet(raw),
    message: ok
      ? 'SLIM translation used Notebook glossary'
      : `Expected VI "${state.glossaryVi}" in output`,
    screenshotPath: null,
    packMode: 'SLIM',
  };
}

async function testD(
  _session: Session,
  _config: NotebookGroundingSmokeConfig,
  _state: GroundingState,
  started: number,
  base: () => Omit<
    GroundingSmokeTestResult,
    'status' | 'message' | 'durationMs' | 'response' | 'screenshotPath'
  >,
): Promise<GroundingSmokeTestResult> {
  return {
    ...base(),
    status: 'SKIP',
    durationMs: Date.now() - started,
    response: null,
    message: 'Test D skipped — Google Drive removed; learning-loop smoke needs local Notebook push.',
    screenshotPath: null,
  };
}

async function ask(session: Session, prompt: string): Promise<string> {
  session.gemini.beginTimeline();
  const correlationId = await session.gemini.submitPlainPrompt(prompt);
  await session.gemini.waitForGenerationStart(45_000);
  await session.gemini.waitForGenerationComplete(correlationId, {
    maxTimeoutMs: 180_000,
    stabilizationWindowMs: 2_500,
  });
  const raw = await session.gemini.extractLatestResponse(correlationId);
  return raw.text.trim();
}

async function waitForNotebookVersion(
  session: Session,
  config: NotebookGroundingSmokeConfig,
  state: GroundingState,
): Promise<{
  ok: boolean;
  reason: string;
  notebookVersion: number | null;
}> {
  const deadline = Date.now() + config.versionProbeTimeoutMs;
  let lastReason = 'pending';
  let lastVersion: number | null = null;

  while (Date.now() < deadline) {
    const raw = await ask(session, VERSION_PROBE_PROMPT);
    const parsed = parseVersionProbeResponse(raw);
    lastVersion = parsed.version;
    const evaluation = evaluateVersionProbeResponse(raw, {
      knowledgeVersion: state.localVersion,
      syncNonce: state.syncNonce,
    });
    lastReason = evaluation.reason;
    if (evaluation.status === 'verified') {
      return { ok: true, reason: evaluation.reason, notebookVersion: parsed.version };
    }
    await session.page.waitForTimeout(config.versionProbeIntervalMs);
  }

  return { ok: false, reason: lastReason, notebookVersion: lastVersion };
}

async function captureFailShot(
  page: Page,
  artifactsDir: string,
  id: GroundingSmokeTestId,
): Promise<string | null> {
  try {
    const file = path.join(artifactsDir, `fail-${id}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch {
    return null;
  }
}
