import fs from 'node:fs';
import path from 'node:path';
import type { GoogleSmokeScenarioId } from './google-smoke-config';

export type SmokeScenarioResultStatus = 'PASS' | 'FAIL' | 'SKIP';

export interface SmokeScenarioResult {
  id: GoogleSmokeScenarioId;
  name: string;
  status: SmokeScenarioResultStatus;
  durationMs: number;
  message: string;
  screenshotPath: string | null;
  timelinePath: string | null;
  timeline: unknown;
}

export interface SmokeRunReport {
  startedAt: string;
  finishedAt: string;
  overall: 'PASS' | 'FAIL' | 'NOT_RUN';
  profilePath: string;
  notebookUrl: string;
  results: SmokeScenarioResult[];
  artifactsDir: string;
}

export function writeSmokeArtifactsJson(
  artifactsDir: string,
  report: SmokeRunReport,
): string {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const file = path.join(artifactsDir, 'last-run.json');
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

export function renderSmokeReportMarkdown(report: SmokeRunReport): string {
  const lines: string[] = [
    '# Real Google Smoke Test Report',
    '',
    '> **Gate:** Playwright Gemini / NotebookLM path is **not production-ready** until Overall = **PASS**.',
    '> This report is overwritten by `npm run test:google-smoke`. Do not claim readiness from unit tests alone.',
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Overall | **${report.overall}** |`,
    `| Started | ${report.startedAt} |`,
    `| Finished | ${report.finishedAt} |`,
    `| Notebook | \`${report.notebookUrl}\` |`,
    `| Profile | \`${report.profilePath}\` |`,
    `| Artifacts | \`${report.artifactsDir}\` |`,
    '',
    '## Scenarios',
    '',
    '| ID | Name | Result | Duration (ms) | Notes | Screenshot (fail) |',
    '| --- | --- | --- | ---: | --- | --- |',
  ];

  for (const r of report.results) {
    lines.push(
      `| ${r.id} | ${r.name} | **${r.status}** | ${r.durationMs} | ${escapeCell(r.message)} | ${r.screenshotPath ? `\`${r.screenshotPath}\`` : '—'} |`,
    );
  }

  lines.push(
    '',
    '## Scenario legend',
    '',
    '| ID | Intent |',
    '| --- | --- |',
    '| A | Open correct Translation Notebook |',
    '| B | Exact token `NOVELTRANS_SMOKE_OK` |',
    '| C | Multiline medium prompt |',
    '| D | Translate 3 fake paragraphs; assert all IDs |',
    '| E | Refresh page mid-session then continue |',
    '| F | Close browser / reopen persistent profile |',
    '| G | New thread |',
    '| H | FULL preprocess tiny fixture (smoke notebook only) |',
    '',
    '## How to run',
    '',
    '```bash',
    'copy google-smoke.config.example.json google-smoke.config.json',
    '# edit profilePath + smoke notebookUrl',
    'set NOVELTRANS_GOOGLE_SMOKE=1',
    'npm run test:google-smoke',
    '```',
    '',
    'Or: Developer Diagnostics → **Run Real Google Smoke**.',
    '',
    '**Never** run against a production novel project.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

export function writeSmokeReportMarkdown(
  reportPath: string,
  report: SmokeRunReport,
): void {
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(reportPath, renderSmokeReportMarkdown(report), 'utf8');
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 200);
}
