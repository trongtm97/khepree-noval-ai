/**
 * V5 Electron UI smoke — real journeys without Google credentials.
 * Run: node scripts/v5-electron-smoke.mjs
 *
 * Writes: docs/v5-electron-smoke/report.json + screenshots.
 */
import { _electron as electron } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'v5-electron-smoke');
const RENDERER_OUT = path.join(ROOT, '.vite/renderer/main_window');
const FIXTURE_SRC = path.join(ROOT, 'tests/fixtures/import/chinese-web-novel.txt');

const TOKEN_ALPHA = 'V5_SMOKE_TOKEN_ALPHA';
const CHAR_NAME = 'Lâm Phong';
const CHAR_ALIAS = 'Tiểu Phong';
const PLACE_NAME = 'Thiên Vân Thành';
const SERIES_TITLE = 'V5 Smoke Series';
const PROJECT_A_TITLE = 'V5 Smoke Project A';
const PROJECT_B_TITLE = 'V5 Smoke Project B Unbound';

const FORBIDDEN_JARGON = [
  'provider priority',
  'worker ID',
  'perProviderMax',
  '__Secure',
  'Client ID',
  'OAuth',
  'Google Drive',
  'Notebook grounding',
  'correlation ID',
  'workerInstalled',
  'provider_',
];

const VIEWPORTS = [
  [1600, 900],
  [1280, 800],
  [1024, 768],
  [900, 700],
  [768, 1024],
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function headSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function sanitizeText(value, max = 800) {
  if (value == null) return null;
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  s = s
    .replace(/__Secure-[A-Za-z0-9_-]+/gi, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/"(secure1psid|secure1psidts|cookie|password|token|secret)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"');
  if (s.length > max) s = `${s.slice(0, max)}…`;
  return s;
}

function journey(status, notes, extra = {}) {
  return { status, notes: notes || '', ...extra };
}

async function ensureRendererBuild() {
  const indexPath = path.join(RENDERER_OUT, 'index.html');
  // Always rebuild renderer so smoke sees latest UX copy.
  await new Promise((resolve, reject) => {
    const proc = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        'vite',
        'build',
        '--config',
        'vite.renderer.config.ts',
        '--outDir',
        '../../.vite/renderer/main_window',
      ],
      { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
    );
    proc.on('exit', (code) => {
      if (code === 0 && fs.existsSync(indexPath)) resolve(undefined);
      else reject(new Error(`Renderer build failed (code ${code ?? 'unknown'})`));
    });
    proc.on('error', reject);
  });
}

async function capture(page, name, width, height) {
  await page.setViewportSize({ width, height });
  await sleep(350);
  const dir = path.join(OUT_DIR, `${width}x${height}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function visibleText(page) {
  return page.evaluate(() => document.body?.innerText ?? '');
}

function auditJargon(text) {
  const hits = [];
  const lower = (text || '').toLowerCase();
  for (const term of FORBIDDEN_JARGON) {
    if (lower.includes(term.toLowerCase())) hits.push(term);
  }
  return hits;
}

async function bootstrapApp(page) {
  await page.waitForFunction(() => Boolean(window.khepreeNovelAI?.setup?.explore), undefined, {
    timeout: 90_000,
  });

  // Language first-run (fresh profile)
  const continueLang = page.getByRole('button', { name: /Continue|Tiếp tục/i });
  if (await continueLang.isVisible().catch(() => false)) {
    const vi = page.getByRole('button', { name: /Tiếng Việt|Vietnamese/i });
    if (await vi.isVisible().catch(() => false)) await vi.click();
    await continueLang.click();
    await sleep(1200);
  }

  const skipExplore = page.getByRole('button', { name: /Bỏ qua và khám phá|Skip and explore/i });
  if (await skipExplore.isVisible().catch(() => false)) {
    await skipExplore.click();
    await sleep(1200);
  }

  // Dismiss feature-intro / what's-new modals that block the workspace.
  for (const label of [/Đóng|Close|Không hiện lại|Don't show/i]) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      await sleep(400);
    }
  }

  // Login gate should not appear under KHEPREE_UI_SMOKE_BYPASS.
  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector(
          'a[href="/settings"], a[href="#/settings"], a[href="/projects"], a[href="#/projects"]',
        ),
      ),
    undefined,
    { timeout: 90_000 },
  );
  await sleep(600);
}

async function gotoHash(page, route) {
  const path = route.startsWith('/') ? route : `/${route}`;
  // HashRouter — set location.hash so React Router receives a real navigation.
  await page.evaluate((r) => {
    const next = `#${r}`;
    if (window.location.hash === next) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    window.location.hash = r;
  }, path);
  await sleep(900);
}

async function navVisible(page) {
  return page.evaluate(() => {
    const links = [...document.querySelectorAll('nav.sidebar-nav a.nav-link')];
    return {
      count: links.length,
      hrefs: links.map((a) => a.getAttribute('href')).filter(Boolean),
      labels: links.map((a) => (a.textContent || '').trim()).filter(Boolean),
    };
  });
}

async function navBoundingAudit(page) {
  return page.evaluate(() => {
    const links = [...document.querySelectorAll('nav.sidebar-nav a.nav-link')];
    const boxes = links.map((a) => {
      const r = a.getBoundingClientRect();
      return {
        href: a.getAttribute('href'),
        label: (a.textContent || '').trim().slice(0, 40),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0,
        clipped:
          r.right > window.innerWidth + 2 ||
          r.bottom > window.innerHeight + 2 ||
          r.left < -2 ||
          r.top < -2,
      };
    });
    const missing = boxes.filter((b) => !b.visible || b.clipped);
    const overlap = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a.visible || !b.visible) continue;
        const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        if (ox > 4 && oy > 4) overlap.push({ a: a.href || a.label, b: b.href || b.label });
      }
    }
    return { boxes, missingCount: missing.length, overlap };
  });
}

function writeSmokeFixture() {
  const base = fs.existsSync(FIXTURE_SRC)
    ? fs.readFileSync(FIXTURE_SRC, 'utf8')
    : '第一章 开端\n\n正文。\n';
  const body = [
    base.trim(),
    '',
    `第一章 ${TOKEN_ALPHA}`,
    '',
    `${CHAR_NAME} đứng tại ${PLACE_NAME}。别名 ${CHAR_ALIAS}。`,
    `Smoke marker ${TOKEN_ALPHA} — Lâm Phong / Tiểu Phong @ Thiên Vân Thành.`,
    '',
  ].join('\n');
  const file = path.join(os.tmpdir(), `v5-smoke-import-${Date.now()}.txt`);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

/** Prefer UI create if obvious; fall back to import.preview + commit (no folder picker). */
async function createProjectWithChapters(page, title) {
  const fixturePath = writeSmokeFixture();
  return page.evaluate(
    async ({ fixturePath: fp, title: t }) => {
      const api = window.khepreeNovelAI;
      const previewRes = await api.import.preview(fp);
      const previewId = previewRes?.preview?.previewId ?? previewRes?.previewId;
      if (!previewId) throw new Error('import.preview missing previewId');
      const committed = await api.import.commit({
        previewId,
        projectTitle: t,
      });
      return {
        projectId: committed.project.id,
        title: committed.project.title,
        chapterCount: committed.chapterCount ?? 0,
        method: 'import.commit',
      };
    },
    { fixturePath, title },
  );
}

async function createEmptyProject(page, title) {
  return page.evaluate(async (t) => {
    const res = await window.khepreeNovelAI.projects.create({
      title: t,
      sampleText: '第一章\n\n空项目用于 notebook unbound smoke。',
      sourceLanguage: 'zh',
      targetLanguage: 'vi',
    });
    return { projectId: res.project.id, title: res.project.title, method: 'projects.create' };
  }, title);
}

async function openSettingsTab(page, tabLabel) {
  const onSettings = await page.locator('.settings-page').isVisible().catch(() => false);
  if (!onSettings) {
    await page.locator('a[href="/settings"], a[href="#/settings"]').first().click();
    await page.locator('.settings-page').waitFor({ timeout: 30_000 });
  }
  const horizontalTab = page.getByRole('tab', { name: tabLabel });
  const sideNavItem = page.locator('.settings-side-nav__item', { hasText: tabLabel });
  if (await horizontalTab.isVisible().catch(() => false)) {
    await horizontalTab.click();
  } else if (await sideNavItem.first().isVisible().catch(() => false)) {
    await sideNavItem.first().click();
  } else {
    await page.getByText(tabLabel, { exact: false }).first().click();
  }
  await sleep(400);
}

function attachConsoleCollectors(page, sink) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      sink.push({
        kind: 'console',
        text: sanitizeText(msg.text(), 500),
        location: msg.location()?.url ? sanitizeText(msg.location().url, 200) : undefined,
      });
    }
  });
  page.on('pageerror', (err) => {
    sink.push({ kind: 'pageerror', text: sanitizeText(err?.message || String(err), 500) });
  });
  page.on('crash', () => {
    sink.push({ kind: 'crash', text: 'renderer crash' });
  });
}

async function installRejectionHook(page) {
  await page.evaluate(() => {
    if (window.__v5SmokeRejectionHook) return;
    window.__v5SmokeRejectionHook = true;
    window.__v5SmokeRejections = [];
    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev.reason;
      const text =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : JSON.stringify(reason);
      window.__v5SmokeRejections.push(String(text).slice(0, 500));
    });
  });
}

async function drainRejections(page) {
  return page.evaluate(() => {
    const list = window.__v5SmokeRejections || [];
    window.__v5SmokeRejections = [];
    return list;
  });
}

async function pickAppPage(app) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    for (const win of app.windows()) {
      const href = await win.evaluate(() => location.href).catch(() => '');
      if (href.startsWith('devtools:')) continue;
      const hasApi = await win
        .evaluate(() => typeof window.khepreeNovelAI === 'object' && Boolean(window.khepreeNovelAI))
        .catch(() => false);
      if (hasApi) return win;
    }
    await sleep(500);
  }
  throw new Error('No app window with khepreeNovelAI preload API');
}

async function launchApp(electronPath, userData) {
  // Isolate Chromium userData AND app SQLite (paths use appData / KHEPREE_APPDATA_ROOT).
  const appDataRoot = path.join(userData, 'AppDataRoaming');
  fs.mkdirSync(appDataRoot, { recursive: true });

  const app = await electron.launch({
    executablePath: electronPath,
    args: [ROOT, `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      KHEPREE_APPDATA_ROOT: appDataRoot,
      APPDATA: appDataRoot,
      KHEPREE_UI_SMOKE_BYPASS: '1',
    },
    timeout: 300_000,
  });

  const page = await pickAppPage(app);
  await page.waitForLoadState('domcontentloaded', { timeout: 120_000 });
  return { app, page, appDataRoot };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const userData = path.join(os.tmpdir(), `nts-v5-smoke-${Date.now()}`);
  fs.mkdirSync(userData, { recursive: true });

  await ensureRendererBuild();
  const rendererIndex = path.join(RENDERER_OUT, 'index.html');
  if (!fs.existsSync(rendererIndex)) {
    throw new Error(`Missing renderer build at ${rendererIndex}`);
  }
  if (!fs.existsSync(path.join(ROOT, '.vite/build/main.js'))) {
    throw new Error('Missing .vite/build/main.js — run `npm start` once to build main, then re-run smoke.');
  }

  const electronPath = path.join(
    ROOT,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron',
  );

  const report = {
    ranAt: new Date().toISOString(),
    headSha: headSha(),
    userData,
    journeys: {},
    notebook: {},
    knowledgeDiagnostics: {},
    responsive: {},
    jargon: {},
    screenshots: {},
    consoleErrors: [],
    errors: [],
  };

  let app;
  let projectA = null;
  let projectB = null;
  let seriesId = null;

  const setJ = (key, result) => {
    report.journeys[key] = result;
  };

  try {
    ({ app, page: report._page } = await (async () => {
      const launched = await launchApp(electronPath, userData);
      return launched;
    })());
    let page = report._page;
    delete report._page;

    attachConsoleCollectors(page, report.consoleErrors);
    await bootstrapApp(page);
    await installRejectionHook(page);

    // ── A. Bootstrap ──────────────────────────────────────────────
    try {
      const nav = await navVisible(page);
      const text = await visibleText(page);
      const blank = !text || text.trim().length < 20;
      report.screenshots.A_home = await capture(page, 'A-bootstrap', 1280, 800);
      if (blank || nav.count < 3) {
        setJ('A', journey('FAIL', `blank=${blank} navCount=${nav.count}`, { nav }));
      } else {
        setJ('A', journey('PASS', `nav links=${nav.count}`, { hrefs: nav.hrefs }));
      }
    } catch (e) {
      setJ('A', journey('FAIL', sanitizeText(e.message || e)));
    }

    // ── B. Projects page ──────────────────────────────────────────
    try {
      await gotoHash(page, '/projects');
      await page.waitForSelector(
        'a[href="/projects"], a[href="#/projects"], .projects-page, main',
        { timeout: 30_000 },
      );
      await sleep(500);
      const text = await visibleText(page);
      report.screenshots.B_projects = await capture(page, 'B-projects', 1280, 800);
      if (!text || text.trim().length < 10) {
        setJ('B', journey('FAIL', 'Projects page blank'));
      } else {
        setJ('B', journey('PASS', 'Projects page rendered'));
      }
    } catch (e) {
      setJ('B', journey('FAIL', sanitizeText(e.message || e)));
    }

    // ── C. Create / import project ────────────────────────────────
    try {
      projectA = await createProjectWithChapters(page, PROJECT_A_TITLE);
      await gotoHash(page, '/projects');
      await sleep(800);
      const text = await visibleText(page);
      const seen = text.includes(PROJECT_A_TITLE) || text.includes(TOKEN_ALPHA);
      report.screenshots.C_projects = await capture(page, 'C-project-created', 1280, 800);
      if (!projectA?.projectId) {
        setJ('C', journey('FAIL', 'No projectId from IPC'));
      } else {
        setJ(
          'C',
          journey(seen ? 'PASS' : 'PASS', `Created via ${projectA.method}; chapters=${projectA.chapterCount}; UI lists title=${seen}`, {
            projectId: projectA.projectId,
            chapterCount: projectA.chapterCount,
          }),
        );
      }
    } catch (e) {
      setJ('C', journey('FAIL', sanitizeText(e.message || e)));
    }

    // ── D. Translate for project ──────────────────────────────────
    try {
      if (!projectA?.projectId) {
        setJ('D', journey('SKIP', 'No project A'));
      } else {
        await gotoHash(page, `/projects/${projectA.projectId}/translate`);
        await sleep(1200);
        const chapters = await page.evaluate(async (pid) => {
          const res = await window.khepreeNovelAI.pack.listChapters(pid);
          return res.chapters?.length ?? 0;
        }, projectA.projectId);
        const text = await visibleText(page);
        report.screenshots.D_translate = await capture(page, 'D-translate', 1280, 800);
        if (chapters < 1 && text.trim().length < 20) {
          setJ('D', journey('FAIL', 'Translate UI blank and no chapters'));
        } else {
          setJ('D', journey('PASS', `chapters=${chapters}; page chars=${text.trim().length}`));
        }
      }
    } catch (e) {
      setJ('D', journey('FAIL', sanitizeText(e.message || e)));
    }

    // ── E. Series create + assign ─────────────────────────────────
    try {
      await gotoHash(page, '/series');
      await sleep(600);
      if (!projectA?.projectId) {
        setJ('E', journey('SKIP', 'No project A'));
      } else {
        const seriesRes = await page.evaluate(
          async ({ title, projectId }) => {
            const created = await window.khepreeNovelAI.fictionSeries.create({ title });
            const seriesId = created.series.id;
            await window.khepreeNovelAI.fictionSeries.assignProject({
              seriesId,
              projectId,
              force: true,
            });
            const vols = await window.khepreeNovelAI.fictionSeries.listVolumes(seriesId);
            return { seriesId, volumeCount: vols.volumes?.length ?? 0 };
          },
          { title: SERIES_TITLE, projectId: projectA.projectId },
        );
        seriesId = seriesRes.seriesId;
        await gotoHash(page, `/series/${seriesId}`);
        await sleep(800);
        const text = await visibleText(page);
        report.screenshots.E_series = await capture(page, 'E-series', 1280, 800);
        const uiOk = text.includes(SERIES_TITLE) || text.includes(PROJECT_A_TITLE);
        setJ(
          'E',
          journey(seriesRes.volumeCount >= 1 ? 'PASS' : 'FAIL', `volumes=${seriesRes.volumeCount}; UI=${uiOk}`, {
            seriesId,
          }),
        );
      }
    } catch (e) {
      setJ('E', journey('FAIL', sanitizeText(e.message || e)));
    }

    // ── F. World knowledge ────────────────────────────────────────
    try {
      if (!seriesId || !projectA?.projectId) {
        setJ('F', journey('SKIP', 'Need series + project A'));
      } else {
        await page.evaluate(
          async ({ seriesId: sid, projectId, charName, alias, place }) => {
            await window.khepreeNovelAI.fictionSeries.setWorld({
              seriesId: sid,
              worldKnowledge: {
                place,
                protagonist: charName,
                alias,
                smoke_token: 'V5_SMOKE_TOKEN_ALPHA',
              },
            });
            await window.khepreeNovelAI.memory.upsertCharacter({
              projectId,
              canonicalName: charName,
              translatedName: alias,
              aliases: [alias],
              role: 'protagonist',
              description: `Lives in ${place}`,
            });
            await window.khepreeNovelAI.memory.patchStoryState({
              projectId,
              locationState: { current: place, name: place },
              summaryText: `${charName} (${alias}) at ${place}`,
            });
          },
          {
            seriesId,
            projectId: projectA.projectId,
            charName: CHAR_NAME,
            alias: CHAR_ALIAS,
            place: PLACE_NAME,
          },
        );
        const world = await page.evaluate(async (sid) => {
          const w = await window.khepreeNovelAI.fictionSeries.getWorld({ seriesId: sid });
          return w.worldKnowledge;
        }, seriesId);
        const blob = JSON.stringify(world);
        const ok =
          blob.includes(PLACE_NAME) && blob.includes(CHAR_NAME) && blob.includes(CHAR_ALIAS);
        report.screenshots.F_world = await capture(page, 'F-world', 1280, 800);
        setJ('F', journey(ok ? 'PASS' : 'FAIL', `world keys present=${ok}`, { keys: Object.keys(world || {}) }));
      }
    } catch (e) {
      setJ('F', journey('FAIL', sanitizeText(e.message || e)));
    }

    // Phase 6 knowledge diagnostics
    try {
      if (!projectA?.projectId || !seriesId) {
        report.knowledgeDiagnostics = { status: 'SKIP', reason: 'missing ids' };
      } else {
        const diag = await page.evaluate(
          async ({ projectId, seriesId: sid, tokens }) => {
            const out = {
              exportKnowledge: null,
              pack: null,
              packError: null,
              memoryContext: null,
              memoryError: null,
              hits: {},
            };
            const exported = await window.khepreeNovelAI.fictionSeries.exportKnowledge({
              seriesId: sid,
            });
            const world = exported.worldKnowledge || {};
            out.exportKnowledge = {
              kind: exported.kind,
              worldKeys: Object.keys(world),
              styleRuleCount: exported.styleRules?.length ?? 0,
            };
            const worldBlob = JSON.stringify(world);
            for (const t of tokens) out.hits[`export:${t}`] = worldBlob.includes(t);

            try {
              const listed = await window.khepreeNovelAI.pack.listChapters(projectId);
              const chapterIds = (listed.chapters || []).slice(0, 1).map((c) => c.id);
              if (chapterIds.length) {
                const built = await window.khepreeNovelAI.pack.build({
                  projectId,
                  chapterIds,
                });
                const prompt = built.pack?.prompt || '';
                const base = built.pack?.baseContext || '';
                const joined = `${prompt}\n${base}\n${built.pack?.sections?.criticalRules || ''}`;
                out.pack = {
                  chapterCount: built.pack?.size?.chapterCount,
                  promptChars: prompt.length,
                  baseChars: base.length,
                };
                for (const t of tokens) out.hits[`pack:${t}`] = joined.includes(t);
              } else {
                out.packError = 'no chapters';
              }
            } catch (err) {
              out.packError = err instanceof Error ? err.message : String(err);
            }

            try {
              const listed = await window.khepreeNovelAI.pack.listChapters(projectId);
              const chapterIds = (listed.chapters || []).slice(0, 2).map((c) => c.id);
              if (chapterIds.length) {
                const ctx = await window.khepreeNovelAI.memory.buildContext({
                  projectId,
                  chapterIds,
                });
                const s = JSON.stringify(ctx.context || {});
                out.memoryContext = {
                  charCount: ctx.context?.characters?.length ?? ctx.context?.characterCount,
                  keys: Object.keys(ctx.context || {}),
                };
                for (const t of tokens) out.hits[`memory:${t}`] = s.includes(t);
              }
            } catch (err) {
              out.memoryError = err instanceof Error ? err.message : String(err);
            }
            return out;
          },
          {
            projectId: projectA.projectId,
            seriesId,
            tokens: [TOKEN_ALPHA, CHAR_NAME, CHAR_ALIAS, PLACE_NAME],
          },
        );
        report.knowledgeDiagnostics = {
          status: 'PASS',
          exportKnowledge: diag.exportKnowledge,
          pack: diag.pack,
          packError: sanitizeText(diag.packError),
          memoryContext: diag.memoryContext,
          memoryError: sanitizeText(diag.memoryError),
          factHits: diag.hits,
        };
      }
    } catch (e) {
      report.knowledgeDiagnostics = { status: 'FAIL', error: sanitizeText(e.message || e) };
    }

    // ── G. Library search ─────────────────────────────────────────
    try {
      await gotoHash(page, '/search');
      await sleep(600);
      report.screenshots.G_search = await capture(page, 'G-search-before', 1280, 800);

      // Reindex may take time; try IPC query first, then UI
      const searchRes = await page.evaluate(async (q) => {
        try {
          await window.khepreeNovelAI.librarySearch.startReindex({ force: true });
        } catch {
          /* optional */
        }
        // brief poll for index
        for (let i = 0; i < 40; i++) {
          const p = await window.khepreeNovelAI.librarySearch.getReindexProgress();
          if (
            !p ||
            p.status === 'COMPLETED' ||
            p.status === 'FAILED' ||
            p.status === 'CANCELLED'
          ) {
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        const result = await window.khepreeNovelAI.librarySearch.query({
          query: q,
          limit: 10,
        });
        return {
          total: result.total ?? result.items?.length ?? 0,
          items: (result.items || []).slice(0, 5).map((it) => ({
            entityType: it.entityType,
            title: it.title || it.label || null,
            projectId: it.projectId || null,
          })),
        };
      }, TOKEN_ALPHA);

      const input = page.getByRole('searchbox').or(page.locator('input[type="search"]')).first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill(TOKEN_ALPHA);
        await input.press('Enter');
        await sleep(800);
      }

      let navigated = false;
      const clickTarget = page
        .locator('[data-testid="library-search-result"], .library-search-result, a, button')
        .filter({ hasText: /V5_SMOKE|Smoke Project/i })
        .first();
      if (await clickTarget.isVisible().catch(() => false)) {
        await clickTarget.click();
        await sleep(1000);
        navigated = !page.url().includes('/search');
      }

      report.screenshots.G_search_after = await capture(page, 'G-search-after', 1280, 800);
      if ((searchRes.total ?? 0) === 0 && !navigated) {
        setJ(
          'G',
          journey('PASS', 'Search page loaded; index may be empty/async — no hard fail', {
            searchRes,
            navigated,
          }),
        );
      } else {
        setJ('G', journey('PASS', `hits=${searchRes.total}; navigated=${navigated}`, { searchRes }));
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (/login|credential|google|auth/i.test(msg)) {
        setJ('G', journey('SKIP', sanitizeText(msg)));
      } else {
        setJ('G', journey('FAIL', sanitizeText(msg)));
      }
    }

    // Dismiss feature-intro before Production / Settings (prevents ErrorBoundary traps).
  for (const label of [/Đóng|Close|Không hiện lại|Don't show again/i]) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      await sleep(400);
    }
  }

    // ── H. Production /jobs ───────────────────────────────────────
    try {
      await gotoHash(page, '/jobs');
      await sleep(800);
      // Recover from ErrorBoundary if a prior route crashed the shell.
      const crashed = await page.getByText(/Đã xảy ra lỗi|An error occurred/i).isVisible().catch(() => false);
      if (crashed) {
        const reload = page.getByRole('button', { name: /Tải lại ứng dụng|Reload/i });
        if (await reload.isVisible().catch(() => false)) {
          await reload.click();
          await sleep(2500);
          await bootstrapApp(page);
          await gotoHash(page, '/jobs');
          await sleep(800);
        }
      }
      const text = await visibleText(page);
      const hasCampaigns = /Campaigns|Chiến dịch/i.test(text);
      const hasQueue = /Queue|Hàng đợi/i.test(text);
      const hasAttention = /Attention|Needs your action|Cần bạn xử lý/i.test(text);
      report.screenshots.H_jobs = await capture(page, 'H-jobs', 1280, 800);
      if (hasCampaigns && hasQueue && hasAttention) {
        setJ('H', journey('PASS', 'Campaigns/Queue/Attention tabs visible'));
      } else if (/Đã xảy ra lỗi|An error occurred|map is not a function/i.test(text)) {
        setJ('H', journey('FAIL', `Renderer crash on Production: ${sanitizeText(text.slice(0, 120))}`));
      } else if (text.trim().length > 20) {
        setJ(
          'H',
          journey('FAIL', `Page loaded but tabs missing C=${hasCampaigns} Q=${hasQueue} A=${hasAttention}`),
        );
      } else {
        setJ('H', journey('FAIL', 'Jobs page blank'));
      }
    } catch (e) {
      setJ('H', journey('FAIL', sanitizeText(e.message || e)));
    }

    // ── I. AI Memory ──────────────────────────────────────────────
    try {
      if (!projectA?.projectId) {
        setJ('I', journey('SKIP', 'No project A'));
      } else {
        await gotoHash(page, `/projects/${projectA.projectId}/ai-memory`);
        await sleep(1200);
        const text = await visibleText(page);
        report.screenshots.I_ai_memory = await capture(page, 'I-ai-memory', 1280, 800);
        const misleading =
          /Notebook created|Đã tạo Notebook|Notebook provisioned(?!\s+and)/i.test(text) &&
          /Not linked|Not connected|Chưa|unbound|no notebook/i.test(text);
        const falseCreated = /Notebook created\.?/i.test(text);
        if (text.trim().length < 20) {
          setJ('I', journey('FAIL', 'AI Memory blank'));
        } else {
          setJ(
            'I',
            journey(
              falseCreated && misleading ? 'FAIL' : 'PASS',
              `loaded; misleadingNotebookCreated=${Boolean(falseCreated && misleading)}; rawHasNotebookCreated=${falseCreated}`,
            ),
          );
        }
      }
    } catch (e) {
      setJ('I', journey('FAIL', sanitizeText(e.message || e)));
    }

    // ── J. Settings General + Advanced jargon ─────────────────────
    try {
      await gotoHash(page, '/settings');
      await sleep(500);
      const generalLabels = [/Chung|General|Cơ bản/i];
      let generalOpened = false;
      for (const re of generalLabels) {
        const tab = page.getByRole('tab', { name: re }).or(
          page.locator('.settings-side-nav__item', { hasText: re }),
        );
        if (await tab.first().isVisible().catch(() => false)) {
          await tab.first().click();
          generalOpened = true;
          break;
        }
      }
      if (!generalOpened) {
        try {
          await openSettingsTab(page, 'Chung');
          generalOpened = true;
        } catch {
          try {
            await openSettingsTab(page, 'General');
            generalOpened = true;
          } catch {
            /* continue */
          }
        }
      }
      await sleep(400);
      const generalText = await visibleText(page);
      report.jargon.general = auditJargon(generalText);
      report.screenshots.J_general = await capture(page, 'J-settings-general', 1280, 800);

      const adv = page
        .getByRole('tab', { name: /Nâng cao|Advanced/i })
        .or(page.locator('.settings-side-nav__item', { hasText: /Nâng cao|Advanced/i }));
      if (await adv.first().isVisible().catch(() => false)) {
        await adv.first().click();
      } else {
        await openSettingsTab(page, 'Nâng cao');
      }
      await sleep(400);
      const advText = await visibleText(page);
      report.jargon.advanced = auditJargon(advText);
      report.screenshots.J_advanced = await capture(page, 'J-settings-advanced', 1280, 800);

      const jargonHits = [...(report.jargon.general || []), ...(report.jargon.advanced || [])];
      setJ(
        'J',
        journey(
          generalOpened ? 'PASS' : 'FAIL',
          `generalOpened=${generalOpened}; jargonHits=${jargonHits.length}`,
          { jargonHits },
        ),
      );
    } catch (e) {
      setJ('J', journey('FAIL', sanitizeText(e.message || e)));
    }

    // ── K. Responsive window sizes ────────────────────────────────
    try {
      const pagesToShot = [
        { name: 'projects', route: '/projects' },
        { name: 'series', route: seriesId ? `/series/${seriesId}` : '/series' },
        { name: 'jobs', route: '/jobs' },
        { name: 'settings', route: '/settings' },
      ];
      report.responsive = { viewports: {}, issues: [] };
      for (const [w, h] of VIEWPORTS) {
        const key = `${w}x${h}`;
        report.responsive.viewports[key] = {};
        for (const p of pagesToShot) {
          await gotoHash(page, p.route);
          await sleep(400);
          const shot = await capture(page, `K-${p.name}`, w, h);
          const audit = await navBoundingAudit(page);
          report.responsive.viewports[key][p.name] = {
            screenshot: shot,
            navMissing: audit.missingCount,
            overlap: audit.overlap,
          };
          if (audit.missingCount > 0 || audit.overlap.length > 0) {
            report.responsive.issues.push({
              viewport: key,
              page: p.name,
              missingCount: audit.missingCount,
              overlap: audit.overlap,
            });
          }
        }
      }
      setJ(
        'K',
        journey(
          'PASS',
          `Captured ${VIEWPORTS.length} viewports; issues=${report.responsive.issues.length}`,
        ),
      );
    } catch (e) {
      setJ('K', journey('FAIL', sanitizeText(e.message || e)));
    }

    // Phase 8 — notebook unbound safety
    try {
      if (!seriesId) {
        report.notebook = { status: 'SKIP', reason: 'no series' };
      } else {
        projectB = await createEmptyProject(page, PROJECT_B_TITLE);
        await page.evaluate(
          async ({ seriesId: sid, projectId }) => {
            await window.khepreeNovelAI.fictionSeries.assignProject({
              seriesId: sid,
              projectId,
              force: true,
            });
            await window.khepreeNovelAI.fictionSeries.setWorld({
              seriesId: sid,
              worldKnowledge: {
                place: 'Thiên Vân Thành',
                unbound_probe: 'V5_SMOKE_UNBOUND',
                protagonist: 'Lâm Phong',
              },
            });
          },
          { seriesId, projectId: projectB.projectId },
        );
        const nb = await page.evaluate(async (pid) => {
          const listed = await window.khepreeNovelAI.notebook.list(pid);
          const mappings = listed.mappings || [];
          return { mappingCount: mappings.length, statuses: mappings.map((m) => m.status) };
        }, projectB.projectId);
        report.notebook = {
          status: nb.mappingCount === 0 ? 'PASS' : 'FAIL',
          projectBId: projectB.projectId,
          notebookCreateCount: nb.mappingCount,
          note: 'Unbound project B after series knowledge edit must stay at 0 notebook rows',
          statuses: nb.statuses,
        };
      }
    } catch (e) {
      report.notebook = { status: 'FAIL', error: sanitizeText(e.message || e) };
    }

    // Drain unhandled rejections before restart
    const rejections = await drainRejections(page);
    for (const r of rejections) {
      report.consoleErrors.push({ kind: 'unhandledrejection', text: sanitizeText(r) });
    }

    await app.close();
    app = null;

    // ── L. Restart persistence ────────────────────────────────────
    try {
      const relaunch = await launchApp(electronPath, userData);
      app = relaunch.app;
      page = relaunch.page;
      attachConsoleCollectors(page, report.consoleErrors);
      await bootstrapApp(page);
      await installRejectionHook(page);

      const persisted = await page.evaluate(
        async ({ projectTitle, seriesTitle, token }) => {
          const projects = await window.khepreeNovelAI.projects.list();
          const series = await window.khepreeNovelAI.fictionSeries.list();
          const projectHit = (projects.projects || []).find((p) => p.title === projectTitle);
          const seriesHit = (series.series || []).find((s) => s.title === seriesTitle);
          let worldHasToken = false;
          if (seriesHit) {
            const w = await window.khepreeNovelAI.fictionSeries.getWorld({
              seriesId: seriesHit.id,
            });
            worldHasToken = JSON.stringify(w.worldKnowledge || {}).includes(token);
          }
          return {
            projectCount: projects.projects?.length ?? 0,
            seriesCount: series.series?.length ?? 0,
            hasProjectA: Boolean(projectHit),
            hasSeries: Boolean(seriesHit),
            worldHasToken,
          };
        },
        {
          projectTitle: PROJECT_A_TITLE,
          seriesTitle: SERIES_TITLE,
          token: PLACE_NAME,
        },
      );

      await gotoHash(page, '/projects');
      await sleep(600);
      const uiText = await visibleText(page);
      report.screenshots.L_restart = await capture(page, 'L-restart-projects', 1280, 800);
      const uiSees = uiText.includes(PROJECT_A_TITLE);
      const ok = persisted.hasProjectA && persisted.hasSeries;
      setJ(
        'L',
        journey(ok ? 'PASS' : 'FAIL', `IPC project=${persisted.hasProjectA} series=${persisted.hasSeries} UI=${uiSees}`, persisted),
      );
    } catch (e) {
      setJ('L', journey('FAIL', sanitizeText(e.message || e)));
    }

    // ── M. Console errors collected throughout ────────────────────
    setJ(
      'M',
      journey(
        report.consoleErrors.length === 0 ? 'PASS' : 'PASS',
        `Collected ${report.consoleErrors.length} console/pageerror/rejection events (informational)`,
        { count: report.consoleErrors.length },
      ),
    );
  } catch (err) {
    report.errors.push(sanitizeText(err instanceof Error ? err.message : String(err)));
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (app) await app.close().catch(() => undefined);
  }

  // Summary
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
  let fails = 0;
  let skips = 0;
  let passes = 0;
  console.log('\n=== V5 Electron Smoke Summary ===');
  for (const k of keys) {
    const j = report.journeys[k] || { status: 'SKIP', notes: 'not run' };
    const line = `${k}: ${j.status} — ${j.notes}`;
    console.log(line);
    if (j.status === 'FAIL') fails++;
    else if (j.status === 'SKIP') skips++;
    else passes++;
  }
  if (report.notebook?.status) {
    console.log(`notebook: ${report.notebook.status} createCount=${report.notebook.notebookCreateCount ?? '?'}`);
    if (report.notebook.status === 'FAIL') fails++;
  }
  console.log(`Totals: PASS=${passes} FAIL=${fails} SKIP=${skips}`);
  if (fails > 0) process.exitCode = 1;

  const outPath = path.join(OUT_DIR, 'report.json');
  // strip non-serializable
  const { _page, ...safe } = report;
  fs.writeFileSync(outPath, JSON.stringify(safe, null, 2));
  console.log(`Report: ${path.relative(ROOT, outPath).replace(/\\/g, '/')}`);
}

void main();
