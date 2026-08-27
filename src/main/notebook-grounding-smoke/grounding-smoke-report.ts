import fs from 'node:fs';
import path from 'node:path';
import type { GroundingSmokeTestId } from './grounding-smoke-config';

export type GroundingResultStatus = 'PASS' | 'FAIL' | 'SKIP';

export interface GroundingSmokeTestResult {
  id: GroundingSmokeTestId;
  name: string;
  status: GroundingResultStatus;
  durationMs: number;
  localVersion: number | null;
  notebookVersion: number | null;
  bindingType: 'STATIC' | 'DRIVE_LIVE' | 'UNKNOWN' | null;
  driveFileId: string | null;
  notebookName: string | null;
  packMode: 'SLIM' | 'HYBRID' | 'FAT' | 'N/A' | null;
  response: string | null;
  message: string;
  screenshotPath: string | null;
}

export interface GroundingSmokeRunReport {
  startedAt: string;
  finishedAt: string;
  overall: 'PASS' | 'FAIL' | 'NOT_RUN';
  profilePath: string;
  notebookUrl: string;
  notebookName: string | null;
  knowledgeKey: string | null;
  artifactsDir: string;
  results: GroundingSmokeTestResult[];
}

const TEST_NAMES: Record<GroundingSmokeTestId, string> = {
  A: 'STATIC grounding (key → value)',
  B: 'LIVE Drive update (no remove/re-add)',
  C: 'SLIM translation (glossary in Notebook only)',
  D: 'Learning loop (SQLite → Drive → Notebook)',
};

export function groundingTestName(id: GroundingSmokeTestId): string {
  return TEST_NAMES[id];
}

export function writeGroundingArtifactsJson(
  artifactsDir: string,
  report: GroundingSmokeRunReport,
): string {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const file = path.join(artifactsDir, 'last-run.json');
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

export function renderGroundingReportMarkdown(report: GroundingSmokeRunReport): string {
  const lines: string[] = [
    '# Real Notebook Grounding Report',
    '',
    '> Proves **real** NotebookLM grounding (no mocks). Opt-in only via Developer Diagnostics or env.',
    '> This report is overwritten by the smoke runner. Never exposes cookies/tokens.',
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Overall | **${report.overall}** |`,
    `| Started | ${report.startedAt} |`,
    `| Finished | ${report.finishedAt} |`,
    `| Notebook URL | \`${report.notebookUrl}\` |`,
    `| Notebook name | ${report.notebookName ? `\`${escapeCell(report.notebookName)}\`` : '—'} |`,
    `| Knowledge key | ${report.knowledgeKey ? `\`${report.knowledgeKey}\`` : '—'} |`,
    `| Profile | \`${report.profilePath}\` |`,
    `| Artifacts | \`${report.artifactsDir}\` |`,
    '',
    '## Tests',
    '',
    '| ID | Name | Result | Local ver | Notebook ver | Binding | Drive file id | Pack | Response | Notes |',
    '| --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |',
  ];

  for (const r of report.results) {
    lines.push(
      `| ${r.id} | ${escapeCell(r.name)} | **${r.status}** | ${r.localVersion ?? '—'} | ${r.notebookVersion ?? '—'} | ${r.bindingType ?? '—'} | ${r.driveFileId ? `\`${r.driveFileId}\`` : '—'} | ${r.packMode ?? '—'} | ${r.response ? `\`${escapeCell(r.response)}\`` : '—'} | ${escapeCell(r.message)} |`,
    );
  }

  lines.push(
    '',
    '## Legend',
    '',
    '| ID | Intent |',
    '| --- | --- |',
    '| A | Static key/value in Notebook source; ask by key only |',
    '| B | Drive content update + version bump; no remove/re-add; stale → `NOTEBOOK_SOURCE_STALE` |',
    '| C | SLIM pack: Chinese source only; VI glossary must come from Notebook |',
    '| D | Confirmed learning: SQLite dirty → Drive → Notebook verify → new mapping |',
    '',
    '## How to run',
    '',
    '```bash',
    'copy google-smoke.config.example.json google-smoke.config.json',
    '# edit profilePath + smoke notebookUrl; optionally grounding*DriveFileId',
    'set NOVELTRANS_NOTEBOOK_GROUNDING_SMOKE=1',
    'npm run test:notebook-grounding-smoke',
    '```',
    '',
    'Or: Developer Diagnostics → **Run Notebook Grounding Smoke**.',
    '',
    '**Never** run against a production novel project.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

export function writeGroundingReportMarkdown(
  reportPath: string,
  report: GroundingSmokeRunReport,
): void {
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(reportPath, renderGroundingReportMarkdown(report), 'utf8');
}

export function renderNotRunGroundingReport(): string {
  return renderGroundingReportMarkdown({
    startedAt: '—',
    finishedAt: '—',
    overall: 'NOT_RUN',
    profilePath: '—',
    notebookUrl: '—',
    notebookName: null,
    knowledgeKey: null,
    artifactsDir: '—',
    results: (['A', 'B', 'C', 'D'] as const).map((id) => ({
      id,
      name: TEST_NAMES[id],
      status: 'SKIP',
      durationMs: 0,
      localVersion: null,
      notebookVersion: null,
      bindingType: null,
      driveFileId: null,
      notebookName: null,
      packMode: null,
      response: null,
      message: 'NOT_RUN — opt-in via Diagnostics or NOVELTRANS_NOTEBOOK_GROUNDING_SMOKE=1',
      screenshotPath: null,
    })),
  });
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\r?\n/g, ' ').slice(0, 180);
}
