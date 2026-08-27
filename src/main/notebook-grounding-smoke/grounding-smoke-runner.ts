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
import { launchNovelTransPersistentContext } from '../automation/browser-runner/launch-persistent-context';
import { AutomationError } from '../automation/errors/automation-errors';
import type { DriveClient } from '../drive/drive-client';
import { DriveOAuthService } from '../drive/drive-oauth-service';
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
  STATIC_VALUE_V2,
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
  bindingType: 'STATIC' | 'DRIVE_LIVE';
  knowledgeDriveFileId: string | null;
  syncStateDriveFileId: string | null;
  notebookName: string | null;
  glossaryVi: string;
  drive: DriveClient | null;
  db: DatabaseManager | null;
  smokeCharacterId: string | null;
}

export interface RunNotebookGroundingSmokeOptions {
  configPath?: string;
  config?: NotebookGroundingSmokeConfig;
  /** Injected Drive client (Diagnostics). */
  driveClient?: DriveClient | null;
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
    knowledgeDriveFileId: resolved.groundingKnowledgeDriveFileId ?? null,
    syncStateDriveFileId: resolved.groundingSyncStateDriveFileId ?? null,
    notebookName: null,
    glossaryVi: GLOSSARY_VI_V1,
    drive: options.driveClient ?? null,
    db: options.db ?? null,
    smokeCharacterId: null,
  };

  try {
    if (!state.drive && resolved.accountId) {
      state.drive = await tryCreateDriveClient(resolved.accountId);
    }

    session = await openSession(resolved, artifactsDir);
    await session.gemini.openProjectNotebook(resolved.notebookUrl);
    await session.gemini.createOrOpenTranslationThread();
    state.notebookName = await readNotebookName(session);

    // Bootstrap sources once for A–D (Drive LIVE preferred).
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
      driveFileId: state.knowledgeDriveFileId,
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

async function tryCreateDriveClient(accountId: string): Promise<DriveClient | null> {
  try {
    const { getSecretStorage } = await import('../security');
    const oauth = new DriveOAuthService(getSecretStorage());
    return await oauth.createDriveClient(accountId);
  } catch {
    return null;
  }
}

async function openSession(
  config: NotebookGroundingSmokeConfig,
  artifactsDir: string,
): Promise<Session> {
  const diagnosticsDir = path.join(artifactsDir, 'diagnostics');
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  const { context } = await launchNovelTransPersistentContext({
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

  if (state.drive) {
    state.bindingType = 'DRIVE_LIVE';
    await ensureDriveDocs(config, state, knowledge, sync.content);
    // Give Drive picker a moment to surface new Docs.
    await session.page.waitForTimeout(2_500);
    // Link once if missing — never remove/re-add later in Test B.
    await session.notebook.addDriveSources(
      [config.knowledgeSourceName, config.syncStateSourceName],
      { preferLiveOverStatic: true },
    ).catch(async () => {
      // Picker flake: fall back to copied text for bootstrap only.
      state.bindingType = 'STATIC';
      await session.notebook.addTextSources([
        { name: config.knowledgeSourceName, content: knowledge },
        { name: config.syncStateSourceName, content: sync.content },
        {
          name: SYNC_STATE_SOURCE_ALIAS,
          content: sync.content,
        },
      ]);
    });
  } else {
    state.bindingType = 'STATIC';
    await session.notebook.addTextSources([
      { name: config.knowledgeSourceName, content: knowledge },
      { name: config.syncStateSourceName, content: sync.content },
      { name: SYNC_STATE_SOURCE_ALIAS, content: sync.content },
    ]);
  }

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

async function ensureDriveDocs(
  config: NotebookGroundingSmokeConfig,
  state: GroundingState,
  knowledgeContent: string,
  syncContent: string,
): Promise<void> {
  const drive = state.drive;
  if (!drive) throw new Error('Drive client not initialized');
  let folderId: string | undefined;

  const ensureFolder = async (): Promise<string> => {
    if (folderId) return folderId;
    const existing = await drive.findFolder(config.groundingDriveFolderName);
    if (existing) {
      folderId = existing.id;
      return folderId;
    }
    const created = await drive.createFolder(config.groundingDriveFolderName);
    folderId = created.id;
    return folderId;
  };

  if (state.knowledgeDriveFileId) {
    await updateDriveDoc(drive, state.knowledgeDriveFileId, knowledgeContent);
  } else {
    const parent = await ensureFolder();
    const created = await drive.createGoogleDoc(
      config.knowledgeSourceName,
      knowledgeContent,
      parent,
    );
    state.knowledgeDriveFileId = created.id;
  }

  if (state.syncStateDriveFileId) {
    await updateDriveDoc(drive, state.syncStateDriveFileId, syncContent);
  } else {
    const parent = await ensureFolder();
    const created = await drive.createGoogleDoc(
      config.syncStateSourceName,
      syncContent,
      parent,
    );
    state.syncStateDriveFileId = created.id;
  }
}

async function updateDriveDoc(
  drive: DriveClient,
  fileId: string,
  content: string,
): Promise<void> {
  try {
    await drive.updateGoogleDocContent(fileId, content);
  } catch {
    await drive.updateFileContent(fileId, content);
  }
}

function seedSmokeLearningRows(state: GroundingState): void {
  const db = state.db;
  if (!db) throw new Error('Database not initialized');
  let project = db.projects.list().find((p) => p.title.includes('NOVELTRANS_SMOKE_GROUNDING'));
  project ??= db.projects.create({
      title: 'NOVELTRANS_SMOKE_GROUNDING',
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
    driveFileId: state.knowledgeDriveFileId,
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
  session: Session,
  config: NotebookGroundingSmokeConfig,
  state: GroundingState,
  started: number,
  base: () => Omit<
    GroundingSmokeTestResult,
    'status' | 'message' | 'durationMs' | 'response' | 'screenshotPath'
  >,
): Promise<GroundingSmokeTestResult> {
  if (!state.drive || !state.knowledgeDriveFileId || !state.syncStateDriveFileId) {
    return {
      ...base(),
      status: 'FAIL',
      durationMs: Date.now() - started,
      response: null,
      message:
        'DRIVE_LIVE required for live update without remove/re-add. Connect Drive + accountId (or set grounding*DriveFileId).',
      screenshotPath: null,
      bindingType: state.bindingType,
    };
  }
  if (state.bindingType !== 'DRIVE_LIVE') {
    return {
      ...base(),
      status: 'FAIL',
      durationMs: Date.now() - started,
      response: null,
      message:
        'Bootstrap fell back to STATIC — cannot prove live Drive update without remove/re-add.',
      screenshotPath: null,
    };
  }

  state.localVersion += 1;
  const sync = buildSmokeSyncStateContent({
    projectId: state.projectId,
    knowledgeVersion: state.localVersion,
  });
  state.syncNonce = sync.syncNonce;

  const knowledge = buildSmokeKnowledgeContent({
    knowledgeKey: state.knowledgeKey,
    knowledgeValue: STATIC_VALUE_V2,
    glossaryVi: state.glossaryVi,
  });

  // Update in place — never remove/re-add Notebook sources.
  await updateDriveDoc(state.drive, state.knowledgeDriveFileId, knowledge);
  await updateDriveDoc(state.drive, state.syncStateDriveFileId, sync.content);

  const probe = await waitForNotebookVersion(session, config, state);
  if (!probe.ok) {
    const staleAsk = await ask(session, buildStaticGroundingQuestion(state.knowledgeKey));
    const stillOld = responseEqualsExpected(staleAsk, STATIC_VALUE_V1);
    return {
      ...base(),
      localVersion: state.localVersion,
      notebookVersion: probe.notebookVersion,
      status: 'FAIL',
      durationMs: Date.now() - started,
      response: sanitizeResponseSnippet(staleAsk),
      message: stillOld
        ? 'NOTEBOOK_SOURCE_STALE'
        : `Version probe failed after Drive update: ${probe.reason}`,
      screenshotPath: null,
      packMode: 'HYBRID',
    };
  }

  const raw = await ask(session, buildStaticGroundingQuestion(state.knowledgeKey));
  if (responseEqualsExpected(raw, STATIC_VALUE_V1)) {
    return {
      ...base(),
      localVersion: state.localVersion,
      notebookVersion: probe.notebookVersion,
      status: 'FAIL',
      durationMs: Date.now() - started,
      response: sanitizeResponseSnippet(raw),
      message: 'NOTEBOOK_SOURCE_STALE',
      screenshotPath: null,
      packMode: 'HYBRID',
    };
  }
  const ok = responseEqualsExpected(raw, STATIC_VALUE_V2);
  return {
    ...base(),
    localVersion: state.localVersion,
    notebookVersion: probe.notebookVersion,
    status: ok ? 'PASS' : 'FAIL',
    durationMs: Date.now() - started,
    response: sanitizeResponseSnippet(raw),
    message: ok
      ? 'Live Drive update grounded without remove/re-add'
      : `Expected "${STATIC_VALUE_V2}", got: ${sanitizeResponseSnippet(raw, 120)}`,
    screenshotPath: null,
    packMode: 'SLIM',
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
  session: Session,
  config: NotebookGroundingSmokeConfig,
  state: GroundingState,
  started: number,
  base: () => Omit<
    GroundingSmokeTestResult,
    'status' | 'message' | 'durationMs' | 'response' | 'screenshotPath'
  >,
): Promise<GroundingSmokeTestResult> {
  // Batch 1 — initial mapping
  const batch1Prompt = buildSlimTranslationPrompt(`${GLOSSARY_SRC}站在山巅。`);
  const batch1 = await ask(session, batch1Prompt);
  if (!responseUsesGlossary(batch1, state.glossaryVi)) {
    return {
      ...base(),
      status: 'FAIL',
      durationMs: Date.now() - started,
      response: sanitizeResponseSnippet(batch1),
      message: `Batch1 missing initial glossary "${state.glossaryVi}"`,
      screenshotPath: null,
    };
  }

  // Confirmed update: SQLite → dirty → Drive → Notebook verify
  state.glossaryVi = GLOSSARY_VI_V2;
  state.localVersion += 1;
  const sync = buildSmokeSyncStateContent({
    projectId: state.projectId,
    knowledgeVersion: state.localVersion,
  });
  state.syncNonce = sync.syncNonce;

  if (state.db && state.smokeCharacterId) {
    state.db.characters.update(state.smokeCharacterId, {
      translated_name: GLOSSARY_VI_V2,
    });
    state.db.knowledgeSyncEvents.insert({
      projectId: state.projectId,
      eventType: 'KNOWLEDGE_DIRTY',
      message: 'Smoke learning: character translation confirmed update',
    });
  }

  const knowledge = buildSmokeKnowledgeContent({
    knowledgeKey: state.knowledgeKey,
    knowledgeValue: STATIC_VALUE_V2,
    glossaryVi: GLOSSARY_VI_V2,
  });

  if (state.drive && state.knowledgeDriveFileId && state.syncStateDriveFileId) {
    await updateDriveDoc(state.drive, state.knowledgeDriveFileId, knowledge);
    await updateDriveDoc(state.drive, state.syncStateDriveFileId, sync.content);
    if (state.db) {
      state.db.knowledgeSyncEvents.insert({
        projectId: state.projectId,
        eventType: 'DRIVE_SYNCED',
        message: 'Smoke learning Drive sync',
      });
    }
  } else if (state.bindingType === 'STATIC') {
    // Cannot update copied-text without remove/re-add — FAIL per product rule for learning loop.
    return {
      ...base(),
      status: 'FAIL',
      durationMs: Date.now() - started,
      response: sanitizeResponseSnippet(batch1),
      message:
        'Learning loop requires DRIVE_LIVE (SQLite → dirty → Drive → Notebook). Drive not available.',
      screenshotPath: null,
    };
  }

  const probe = await waitForNotebookVersion(session, config, state);
  if (state.db) {
    state.db.knowledgeSyncEvents.insert({
      projectId: state.projectId,
      eventType: probe.ok ? 'NOTEBOOK_SYNC_VERIFIED' : 'NOTEBOOK_GROUNDING_UNVERIFIED',
      message: probe.ok
        ? `Notebook verified v${state.localVersion}`
        : `Notebook probe failed: ${probe.reason}`,
    });
  }
  if (!probe.ok) {
    return {
      ...base(),
      localVersion: state.localVersion,
      notebookVersion: probe.notebookVersion,
      status: 'FAIL',
      durationMs: Date.now() - started,
      response: null,
      message: `NOTEBOOK_SOURCE_STALE / probe: ${probe.reason}`,
      screenshotPath: null,
      packMode: 'HYBRID',
    };
  }

  const batch2Prompt = buildSlimTranslationPrompt(`${GLOSSARY_SRC}收回长剑。`);
  if (batch2Prompt.includes(GLOSSARY_VI_V2) || batch2Prompt.includes(GLOSSARY_VI_V1)) {
    throw new Error('Invariant broken: batch2 prompt must not contain VI mapping');
  }
  const batch2 = await ask(session, batch2Prompt);
  const ok = responseUsesGlossary(batch2, GLOSSARY_VI_V2);
  const stillOld = responseUsesGlossary(batch2, GLOSSARY_VI_V1) && !ok;

  return {
    ...base(),
    localVersion: state.localVersion,
    notebookVersion: probe.notebookVersion,
    status: ok ? 'PASS' : 'FAIL',
    durationMs: Date.now() - started,
    response: sanitizeResponseSnippet(batch2),
    message: ok
      ? 'Learning loop: batch2 used updated mapping'
      : stillOld
        ? 'NOTEBOOK_SOURCE_STALE — batch2 still used old mapping'
        : `Batch2 expected "${GLOSSARY_VI_V2}"`,
    screenshotPath: null,
    packMode: 'SLIM',
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
