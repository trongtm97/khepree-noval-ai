/**
 * Developer-triggered browser conversation smoke.
 * Requires logged-in Playwright profile + BROWSER_CONVERSATION_SMOKE=1.
 *
 * Usage:
 *   set BROWSER_CONVERSATION_SMOKE=1
 *   npx tsx scripts/browser-conversation-smoke.ts chatgpt
 *   npx tsx scripts/browser-conversation-smoke.ts meta
 *
 * Writes artifacts/browser-smoke/<provider>.json for Phase 7 report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { BrowserConversationHarness } from '../src/main/automation/conversation/browser-conversation-harness';
import { ChatGptSurfaceAdapter } from '../src/main/automation/conversation/adapters/chatgpt-surface-adapter';
import { MetaAiSurfaceAdapter } from '../src/main/automation/conversation/adapters/meta-ai-surface-adapter';

const SYNTHETIC_PARAGRAPHS = [
  'Paragraph A: The clock tower chimed twice before the market opened.',
  'Paragraph B: A courier left three sealed envelopes at the gate.',
  'Paragraph C: Rain paused long enough for the lanterns to stay lit.',
];

async function main(): Promise<void> {
  if (process.env.BROWSER_CONVERSATION_SMOKE !== '1') {
    console.error('Set BROWSER_CONVERSATION_SMOKE=1 to run live browser smoke.');
    process.exit(1);
  }

  const provider = (process.argv[2] ?? 'chatgpt').toLowerCase();
  if (provider === 'gemini') {
    console.error('Gemini live smoke: use tests/google-smoke with KHEPREE_NOVEL_AI_GOOGLE_SMOKE=1');
    process.exit(2);
  }

  const reportDir = path.join(process.cwd(), 'artifacts', 'browser-smoke');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${provider}.json`);

  let ok = false;
  let errorMessage: string | null = null;
  const harness = new BrowserConversationHarness();
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const adapter =
      provider === 'meta' ? new MetaAiSurfaceAdapter() : new ChatGptSurfaceAdapter();
    const url = provider === 'meta' ? 'https://www.meta.ai/' : 'https://chatgpt.com/';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    for (const [i, paragraph] of SYNTHETIC_PARAGRAPHS.entries()) {
      console.log(`[smoke] ${provider} paragraph ${i + 1}/3`);
      const result = await harness.run({
        page,
        adapter,
        prompt: paragraph,
        timeouts: {
          sendConfirmMs: 20_000,
          generationStartMs: 60_000,
          streamingMs: 180_000,
          stabilizationMs: 180_000,
        },
      });
      console.log(`[smoke] ok requestId=${result.requestId} chars=${result.text.length}`);
    }

    ok = true;
    await browser.close();
    console.log('[smoke] PASS');
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[smoke] FAIL', errorMessage);
    await browser.close().catch(() => undefined);
  }

  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        provider,
        ok,
        error: errorMessage,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
