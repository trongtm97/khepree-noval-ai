import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { DIAGNOSTICS_EXPORT_EXCLUDE } from '@shared/constants/diagnostics';
import type { HealthReport } from '@shared/schemas/diagnostics';
import { redactDiagnosticText } from './diagnostics';
import { defaultSelectorOverridesPath, getCachedSelectorOverrides } from './selectors/selector-override-loader';

const FORBIDDEN_PATH_FRAGMENTS = [
  'cookies',
  'oauth',
  'token',
  'localstorage',
  'sessionstorage',
  'password',
  'credential',
  'browserprofiles',
  'browser-profiles',
  'local storage',
  'session storage',
];

export function isForbiddenDiagnosticsPath(filePath: string): boolean {
  const lower = filePath.toLowerCase().replace(/\\/g, '/');
  return FORBIDDEN_PATH_FRAGMENTS.some((frag) => lower.includes(frag));
}

export async function buildDiagnosticsExportZip(input: {
  healthReport: HealthReport;
  automationCacheDir: string;
  logsDir: string;
  outputPath: string;
}): Promise<{ filePath: string; entryCount: number; excluded: string[] }> {
  const zip = new JSZip();
  const excluded: string[] = [...DIAGNOSTICS_EXPORT_EXCLUDE];
  let entryCount = 0;

  zip.file('health-report.json', JSON.stringify(input.healthReport, null, 2));
  entryCount += 1;

  zip.file(
    'provider-status.json',
    JSON.stringify({ providers: input.healthReport.providers }, null, 2),
  );
  entryCount += 1;

  try {
    const overrides = getCachedSelectorOverrides();
    zip.file(
      'selector-overrides.json',
      JSON.stringify(overrides, null, 2),
    );
    entryCount += 1;
    zip.file('selector-overrides-path.txt', defaultSelectorOverridesPath());
    entryCount += 1;
  } catch {
    excluded.push('selector-overrides (read failed)');
  }

  const failuresDir = path.join(input.automationCacheDir);
  if (fs.existsSync(failuresDir)) {
    const added = addSanitizedTree(zip, failuresDir, 'automation-diagnostics', 40);
    entryCount += added.added;
    excluded.push(...added.excluded);
  }

  if (fs.existsSync(input.logsDir)) {
    const logFiles = fs
      .readdirSync(input.logsDir)
      .filter((f) => f.endsWith('.log') || f.endsWith('.jsonl') || f.endsWith('.txt'))
      .slice(0, 5);
    for (const name of logFiles) {
      const full = path.join(input.logsDir, name);
      if (isForbiddenDiagnosticsPath(full)) {
        excluded.push(name);
        continue;
      }
      try {
        const raw = fs.readFileSync(full, 'utf8');
        const redacted = redactDiagnosticText(raw).slice(-200_000);
        zip.file(`logs/${name}`, redacted);
        entryCount += 1;
      } catch {
        excluded.push(name);
      }
    }
  }

  zip.file(
    'README.txt',
    [
      'NovelTrans Studio diagnostics export',
      'Excludes cookies, OAuth tokens, browser profiles, and localStorage secrets.',
      `Generated: ${input.healthReport.generatedAt}`,
      '',
    ].join('\n'),
  );
  entryCount += 1;

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, buffer);
  return { filePath: input.outputPath, entryCount, excluded: [...new Set(excluded)] };
}

function addSanitizedTree(
  zip: JSZip,
  root: string,
  zipPrefix: string,
  maxFiles: number,
): { added: number; excluded: string[] } {
  const excluded: string[] = [];
  let added = 0;
  const stack = [root];
  while (stack.length > 0 && added < maxFiles) {
    const dir = stack.pop();
    if (!dir) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (added >= maxFiles) break;
      const full = path.join(dir, ent.name);
      if (isForbiddenDiagnosticsPath(full)) {
        excluded.push(path.relative(root, full));
        continue;
      }
      if (ent.isDirectory()) {
        stack.push(full);
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (!['.png', '.html', '.json', '.txt', '.log'].includes(ext)) {
        continue;
      }
      try {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        let content: Buffer | string = fs.readFileSync(full);
        if (ext === '.html' || ext === '.txt' || ext === '.log' || ext === '.json') {
          content = redactDiagnosticText(content.toString('utf8'));
        }
        zip.file(`${zipPrefix}/${rel}`, content);
        added += 1;
      } catch {
        excluded.push(ent.name);
      }
    }
  }
  return { added, excluded };
}
