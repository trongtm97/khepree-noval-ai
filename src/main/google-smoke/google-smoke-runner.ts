/**
 * Real Google smoke runner — headed Playwright against a logged-in profile.
 * Opt-in only (NOVELTRANS_GOOGLE_SMOKE=1). Never default CI.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { GeminiBrowserProvider } from '../automation/providers/google/gemini-browser-provider';
import { BrowserEventLogger } from '../automation/browser-event-logger';
import { launchNovelTransPersistentContext } from '../automation/browser-runner/launch-persistent-context';
import { AutomationError } from '../automation/errors/automation-errors';
import { formatParagraphId } from '@shared/utils/stable-id';
import { buildFullNovelPreprocessPrompt } from '../bootstrap/full-novel-preprocess-prompts';
import {
  loadGoogleSmokeConfig,
  parseGoogleSmokeConfig,
  SMOKE_OK_TOKEN,
  type GoogleSmokeConfig,
  type GoogleSmokeScenarioId,
} from './google-smoke-config';
import {
  writeSmokeArtifactsJson,
  writeSmokeReportMarkdown,
  type SmokeRunReport,
  type SmokeScenarioResult,
} from './google-smoke-report';

const SCENARIO_NAMES: Record<GoogleSmokeScenarioId, string> = {
  A: 'Open Translation Notebook',
  B: 'Exact smoke token response',
  C: 'Multiline medium prompt',
  D: 'Translate 3 fake paragraphs (IDs)',
  E: 'Refresh page then continue',
  F: 'Close / reopen persistent profile',
  G: 'New thread',
  H: 'FULL preprocess tiny fixture',
};

interface Session {
  context: BrowserContext;
  page: Page;
  provider: GeminiBrowserProvider;
  diagnosticsDir: string;
}

export async function runGoogleSmoke(
  configOrOptions?: GoogleSmokeConfig | { configPath?: string },
): Promise<SmokeRunReport> {
  const config =
    configOrOptions && 'profilePath' in configOrOptions && 'notebookUrl' in configOrOptions
      ? parseGoogleSmokeConfig(configOrOptions)
      : loadGoogleSmokeConfig(
          configOrOptions && 'configPath' in configOrOptions
            ? configOrOptions.configPath
            : undefined,
        );

  if (!fs.existsSync(config.profilePath)) {
    throw new Error(`Profile path does not exist: ${config.profilePath}`);
  }

  const artifactsDir = path.resolve(config.artifactsDir);
  fs.mkdirSync(artifactsDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const results: SmokeScenarioResult[] = [];

  let session: Session | null = null;
  try {
    session = await openSession(config, artifactsDir);

    for (const id of config.scenarios) {
      const result = await runOne(id, config, session, artifactsDir, async () => {
        // Scenario F replaces session
        if (id === 'F') {
          await closeSession(session);
          session = await openSession(config, artifactsDir);
          return session;
        }
        return session!;
      });
      results.push(result);
      if (result.status === 'FAIL' && id === 'A') {
        // Notebook open failed — remaining scenarios unlikely to pass.
        for (const rest of config.scenarios.filter((s) => !results.some((r) => r.id === s))) {
          results.push({
            id: rest,
            name: SCENARIO_NAMES[rest],
            status: 'SKIP',
            durationMs: 0,
            message: 'Skipped after A failed',
            screenshotPath: null,
            timelinePath: null,
            timeline: null,
          });
        }
        break;
      }
    }
  } catch (error) {
    results.push({
      id: 'A',
      name: SCENARIO_NAMES.A,
      status: 'FAIL',
      durationMs: 0,
      message: error instanceof Error ? error.message : String(error),
      screenshotPath: null,
      timelinePath: null,
      timeline: null,
    });
  } finally {
    await closeSession(session);
  }

  const finishedAt = new Date().toISOString();
  const executed = results.filter((r) => r.status !== 'SKIP');
  const overall: SmokeRunReport['overall'] =
    executed.length === 0
      ? 'NOT_RUN'
      : executed.every((r) => r.status === 'PASS')
        ? 'PASS'
        : 'FAIL';

  const report: SmokeRunReport = {
    startedAt,
    finishedAt,
    overall,
    profilePath: config.profilePath,
    notebookUrl: config.notebookUrl,
    results,
    artifactsDir,
  };

  writeSmokeArtifactsJson(artifactsDir, report);
  writeSmokeReportMarkdown(path.resolve(config.reportMarkdownPath), report);
  return report;
}

async function openSession(
  config: GoogleSmokeConfig,
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
  const provider = new GeminiBrowserProvider({
    diagnosticsDir,
    eventLogger,
    expectedNotebookUrl: config.notebookUrl,
  });
  provider.attachPage(page);
  provider.beginTimeline();
  return { context, page, provider, diagnosticsDir };
}

async function closeSession(session: Session | null): Promise<void> {
  if (!session) return;
  await session.provider.detach().catch(() => undefined);
  await session.context.close().catch(() => undefined);
}

async function runOne(
  id: GoogleSmokeScenarioId,
  config: GoogleSmokeConfig,
  session: Session,
  artifactsDir: string,
  refreshSession: () => Promise<Session>,
): Promise<SmokeScenarioResult> {
  const started = Date.now();
  let live = session;
  live.provider.beginTimeline();
  try {
    switch (id) {
      case 'A':
        await scenarioA(live, config);
        break;
      case 'B':
        await scenarioB(live);
        break;
      case 'C':
        await scenarioC(live);
        break;
      case 'D':
        await scenarioD(live);
        break;
      case 'E':
        await scenarioE(live, config);
        break;
      case 'F':
        live = await refreshSession();
        await scenarioF(live, config);
        break;
      case 'G':
        await scenarioG(live);
        break;
      case 'H':
        await scenarioH(live);
        break;
      default: {
        const _e: never = id;
        throw new Error(`Unknown scenario ${_e}`);
      }
    }
    const timeline = live.provider.getTimeline()?.snapshot() ?? null;
    const timelinePath = writeTimeline(artifactsDir, id, timeline);
    return {
      id,
      name: SCENARIO_NAMES[id],
      status: 'PASS',
      durationMs: Date.now() - started,
      message: 'OK',
      screenshotPath: null,
      timelinePath,
      timeline,
    };
  } catch (error) {
    const message =
      error instanceof AutomationError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    const timeline =
      (error instanceof AutomationError ? error.diagnostics?.timeline : null) ??
      live.provider.getTimeline()?.snapshot() ??
      null;
    const timelinePath = writeTimeline(artifactsDir, id, timeline);
    const screenshotPath =
      (error instanceof AutomationError ? error.diagnostics?.screenshotPath : null) ??
      (await captureFailShot(live.page, artifactsDir, id));
    return {
      id,
      name: SCENARIO_NAMES[id],
      status: 'FAIL',
      durationMs: Date.now() - started,
      message,
      screenshotPath,
      timelinePath,
      timeline,
    };
  }
}

async function scenarioA(session: Session, config: GoogleSmokeConfig): Promise<void> {
  await session.provider.openProjectNotebook(config.notebookUrl);
  const snap = session.provider.getTimeline()?.snapshot();
  const ok = snap?.entries.some((e) => e.step === 'NOTEBOOK_VERIFIED' && e.ok);
  if (!ok) {
    throw new Error('NOTEBOOK_VERIFIED missing from timeline');
  }
  await session.provider.createOrOpenTranslationThread();
}

async function scenarioB(session: Session): Promise<void> {
  const prompt = `Chỉ trả đúng chuỗi: ${SMOKE_OK_TOKEN}`;
  const correlationId = await session.provider.submitPlainPrompt(prompt);
  assertTimelineHas(session, 'SEND_CONFIRMED');
  await session.provider.waitForGenerationStart(30_000);
  await session.provider.waitForGenerationComplete(correlationId, {
    maxTimeoutMs: 90_000,
    stabilizationWindowMs: 2_000,
  });
  const raw = await session.provider.extractLatestResponse(correlationId);
  const text = raw.text.trim();
  if (!text.includes(SMOKE_OK_TOKEN)) {
    throw new Error(`Expected ${SMOKE_OK_TOKEN} in response, got: ${text.slice(0, 200)}`);
  }
  // Prefer exact (allow whitespace / marker noise around token)
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned.includes(SMOKE_OK_TOKEN)) {
    throw new Error('Smoke token missing after normalize');
  }
}

async function scenarioC(session: Session): Promise<void> {
  const body = Array.from({ length: 24 }, (_, i) => `Line ${i + 1}: smoke multiline body.`).join(
    '\n',
  );
  const prompt = `${body}\n\nReply with one short Vietnamese sentence confirming you read ${body.split('\n').length} lines.`;
  const correlationId = await session.provider.submitPlainPrompt(prompt);
  assertTimelineHas(session, 'SEND_CONFIRMED');
  await session.provider.waitForGenerationStart(30_000);
  await session.provider.waitForGenerationComplete(correlationId, {
    maxTimeoutMs: 120_000,
    stabilizationWindowMs: 2_000,
  });
  const raw = await session.provider.extractLatestResponse(correlationId);
  if (raw.text.trim().length < 4) {
    throw new Error('Empty multiline response');
  }
}

async function scenarioD(session: Session): Promise<void> {
  const id1 = formatParagraphId(1, 1);
  const id2 = formatParagraphId(1, 2);
  const id3 = formatParagraphId(1, 3);
  const prompt = [
    'Translate these Chinese paragraphs to Vietnamese.',
    'Keep each paragraph ID exactly at the start of the translated line.',
    'Do not invent extra IDs.',
    '',
    `${id1} 小明走进了教室。`,
    `${id2} 老师正在黑板上写字。`,
    `${id3} 同学们安静地听讲。`,
  ].join('\n');
  const correlationId = await session.provider.submitPlainPrompt(prompt);
  assertTimelineHas(session, 'SEND_CONFIRMED');
  await session.provider.waitForGenerationStart(30_000);
  await session.provider.waitForGenerationComplete(correlationId, {
    maxTimeoutMs: 120_000,
    stabilizationWindowMs: 2_000,
  });
  const raw = await session.provider.extractLatestResponse(correlationId);
  for (const id of [id1, id2, id3]) {
    if (!raw.text.includes(id)) {
      throw new Error(`Missing paragraph ID ${id} in response`);
    }
  }
}

async function scenarioE(session: Session, config: GoogleSmokeConfig): Promise<void> {
  await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  session.provider.attachPage(session.page);
  session.provider.beginTimeline();
  await session.provider.openProjectNotebook(config.notebookUrl);
  await session.provider.createOrOpenTranslationThread();
  const correlationId = await session.provider.submitPlainPrompt(
    `After refresh, reply with exactly: ${SMOKE_OK_TOKEN}`,
  );
  assertTimelineHas(session, 'SEND_CONFIRMED');
  await session.provider.waitForGenerationStart(30_000);
  await session.provider.waitForGenerationComplete(correlationId, {
    maxTimeoutMs: 90_000,
    stabilizationWindowMs: 2_000,
  });
  const raw = await session.provider.extractLatestResponse(correlationId);
  if (!raw.text.includes(SMOKE_OK_TOKEN)) {
    throw new Error('Post-refresh smoke token missing');
  }
}

async function scenarioF(session: Session, config: GoogleSmokeConfig): Promise<void> {
  // Session already reopened by refreshSession hook.
  await session.provider.openProjectNotebook(config.notebookUrl);
  await session.provider.createOrOpenTranslationThread();
  const correlationId = await session.provider.submitPlainPrompt(
    `After profile reopen, reply with exactly: ${SMOKE_OK_TOKEN}`,
  );
  assertTimelineHas(session, 'SEND_CONFIRMED');
  await session.provider.waitForGenerationStart(30_000);
  await session.provider.waitForGenerationComplete(correlationId, {
    maxTimeoutMs: 90_000,
    stabilizationWindowMs: 2_000,
  });
  const raw = await session.provider.extractLatestResponse(correlationId);
  if (!raw.text.includes(SMOKE_OK_TOKEN)) {
    throw new Error('Post-reopen smoke token missing');
  }
}

async function scenarioG(session: Session): Promise<void> {
  await session.provider.createOrOpenTranslationThread({ forceNew: true });
  const correlationId = await session.provider.submitPlainPrompt(
    `New thread smoke. Reply with exactly: ${SMOKE_OK_TOKEN}`,
  );
  assertTimelineHas(session, 'SEND_CONFIRMED');
  await session.provider.waitForGenerationStart(30_000);
  await session.provider.waitForGenerationComplete(correlationId, {
    maxTimeoutMs: 90_000,
    stabilizationWindowMs: 2_000,
  });
  const raw = await session.provider.extractLatestResponse(correlationId);
  if (!raw.text.includes(SMOKE_OK_TOKEN)) {
    throw new Error('New-thread smoke token missing');
  }
}

async function scenarioH(session: Session): Promise<void> {
  const tiny = [
    'NOVEL_PART_01.txt (tiny smoke fixture — NOT a production novel)',
    formatParagraphId(1, 1) + ' 从前有座山。',
    formatParagraphId(1, 2) + ' 山里有座庙。',
    formatParagraphId(1, 3) + ' 庙里有个老和尚。',
  ].join('\n');
  const base = buildFullNovelPreprocessPrompt({
    projectTitle: 'NOVELTRANS_SMOKE Tiny Fixture',
    author: 'Smoke',
    genre: 'test',
    partFileNames: ['NOVEL_PART_01.txt'],
  });
  const prompt = [
    base,
    '',
    '## Inline tiny source (smoke only — treat as uploaded)',
    tiny,
    '',
    'For this smoke test, you MAY return ONLY ```file:00_BOOK_PROFILE.md with a short stub if evidence is thin.',
  ].join('\n');
  const correlationId = await session.provider.submitPlainPrompt(prompt);
  assertTimelineHas(session, 'SEND_CONFIRMED');
  await session.provider.waitForGenerationStart(45_000);
  await session.provider.waitForGenerationComplete(correlationId, {
    maxTimeoutMs: 180_000,
    stabilizationWindowMs: 3_000,
  });
  const raw = await session.provider.extractLatestResponse(correlationId);
  if (!/00_BOOK_PROFILE\.md/i.test(raw.text) && !/```file:00_BOOK_PROFILE/i.test(raw.text)) {
    throw new Error('Preprocess smoke: expected 00_BOOK_PROFILE.md fence in response');
  }
}

function assertTimelineHas(session: Session, step: string): void {
  const snap = session.provider.getTimeline()?.snapshot();
  const hit = snap?.entries.some((e) => e.step === step && e.ok);
  if (!hit) {
    throw new Error(`Expected timeline step ${step}`);
  }
}

function writeTimeline(
  artifactsDir: string,
  id: GoogleSmokeScenarioId,
  timeline: unknown,
): string | null {
  if (!timeline) return null;
  const file = path.join(artifactsDir, `timeline-${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(timeline, null, 2)}\n`, 'utf8');
  return file;
}

async function captureFailShot(
  page: Page,
  artifactsDir: string,
  id: GoogleSmokeScenarioId,
): Promise<string | null> {
  try {
    const file = path.join(artifactsDir, `fail-${id}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch {
    return null;
  }
}
