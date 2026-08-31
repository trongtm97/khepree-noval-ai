/**
 * Emit Phase 7 browser smoke status report (PASS / FAIL / NOT_RUN).
 * Does not execute smoke — reads env + optional result files only.
 *
 * Usage:
 *   npx tsx scripts/browser-conversation-smoke-report.ts
 */
import fs from 'node:fs';
import path from 'node:path';

type SmokeResult = 'PASS' | 'FAIL' | 'NOT_RUN';

interface ProviderRow {
  provider: string;
  login: SmokeResult;
  sendConfirm: SmokeResult;
  responseAnchor: SmokeResult;
  translation: SmokeResult;
  overall: SmokeResult;
  note?: string;
}

const REPORT_DIR = path.join(process.cwd(), 'artifacts', 'browser-smoke');

function readResultFile(name: string): SmokeResult {
  const p = path.join(REPORT_DIR, `${name}.json`);
  if (!fs.existsSync(p)) return 'NOT_RUN';
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as { ok?: boolean };
    return data.ok === true ? 'PASS' : 'FAIL';
  } catch {
    return 'FAIL';
  }
}

function row(provider: string, fileKey: string): ProviderRow {
  const ran = process.env.BROWSER_CONVERSATION_SMOKE === '1' || fs.existsSync(path.join(REPORT_DIR, `${fileKey}.json`));
  const overall = readResultFile(fileKey);
  const mapped: SmokeResult = ran && overall !== 'NOT_RUN' ? overall : 'NOT_RUN';
  return {
    provider,
    login: mapped,
    sendConfirm: mapped,
    responseAnchor: mapped,
    translation: mapped,
    overall: mapped,
    note: mapped === 'NOT_RUN' ? 'Manual smoke not executed in this environment' : undefined,
  };
}

const rows: ProviderRow[] = [
  row('ChatGPT', 'chatgpt'),
  row('Meta AI', 'meta'),
  row('Gemini', 'gemini'),
];

console.log('# Browser smoke report (Phase 7)\n');
console.log('| Provider | Login | Send Confirm | Response Anchor | Translation | Overall |');
console.log('|----------|-------|--------------|-----------------|-------------|---------|');
for (const r of rows) {
  console.log(
    `| ${r.provider} | ${r.login} | ${r.sendConfirm} | ${r.responseAnchor} | ${r.translation} | ${r.overall} |`,
  );
}

const anyFail = rows.some((r) => r.overall === 'FAIL');
const allPass = rows.every((r) => r.overall === 'PASS');
const status = allPass ? 'RELEASE CANDIDATE (browser)' : anyFail ? 'NOT READY' : 'READY FOR EXTENDED TEST';

console.log(`\nFinal status: **${status}**`);
console.log('\nNOT_RUN is never treated as PASS.');

if (!fs.existsSync(REPORT_DIR)) {
  console.log(`\nTo record results, write ${REPORT_DIR}/<provider>.json with { "ok": true|false } after manual smoke.`);
}
