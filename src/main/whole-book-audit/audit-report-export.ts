import fs from 'node:fs';
import path from 'node:path';
import type { WholeBookAuditReport } from '@shared/schemas/whole-book-audit';
import { resolveExportDirectory } from '../portability/export-path-resolver';
import type { DatabaseManager } from '../db/database-manager';
import { sanitizeFilename } from '@shared/utils/sanitize-filename';
import { pathsService } from '../services/paths-service';

export function buildChapterOpenHref(
  projectId: string,
  chapterId: string | null,
  stableParagraphId: string | null,
): string {
  const base = `/projects/${projectId}/translate`;
  const q = new URLSearchParams();
  if (chapterId) q.set('chapter', chapterId);
  if (stableParagraphId) q.set('paragraph', stableParagraphId);
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

export function renderAuditReportHtml(report: WholeBookAuditReport): string {
  const rows = report.findings
    .map((f) => {
      const sev = f.severity;
      return `<tr class="sev-${sev}">
  <td>${escapeHtml(sev)}</td>
  <td>${escapeHtml(f.code)}</td>
  <td>${escapeHtml(f.message)}</td>
  <td>${f.chapterNumber ?? '—'}</td>
  <td>${escapeHtml(f.status)}</td>
  <td><a href="${escapeHtml(f.openHref)}">Open</a></td>
</tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Whole-book Audit — ${escapeHtml(report.projectTitle)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
    h1 { font-size: 1.4rem; }
    .meta { color: #555; margin-bottom: 1.5rem; }
    table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
    th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
    th { background: #f4f4f4; }
    tr.sev-error { background: #fff5f5; }
    tr.sev-warning { background: #fffbeb; }
    a { color: #0b5fff; }
  </style>
</head>
<body>
  <h1>Whole-book Audit</h1>
  <div class="meta">
    <div><strong>${escapeHtml(report.projectTitle)}</strong></div>
    <div>Run ${escapeHtml(report.runId)} · ${escapeHtml(report.status)} · ${escapeHtml(report.generatedAt)}</div>
    <div>Chapters ${report.summary.chaptersTotal} · Findings ${report.summary.findingsCount}
      · Critical ${report.summary.criticalCount} · Open ${report.summary.openCount}
      · Auto-repaired ${report.summary.autoRepairedCount}</div>
    <div>Index: characters ${report.indexStats.characterCount}, terms ${report.indexStats.termCount},
      places/orgs ${report.indexStats.placeOrgCount}, paragraphs ${report.indexStats.paragraphCount}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Severity</th><th>Code</th><th>Message</th>
        <th>Ch</th><th>Status</th><th>Link</th>
      </tr>
    </thead>
    <tbody>
${rows || '<tr><td colspan="6">No findings</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function writeAuditReports(
  db: DatabaseManager,
  projectId: string,
  report: WholeBookAuditReport,
): { jsonPath: string | null; htmlPath: string | null } {
  const resolved = resolveExportDirectory(db, { projectId });
  let dir: string;
  if (resolved.status === 'ok') {
    dir = path.join(resolved.directory, 'audits');
  } else {
    dir = path.join(pathsService.getPath('data'), 'audits', projectId);
  }
  fs.mkdirSync(dir, { recursive: true });
  const base = sanitizeFilename(
    `whole-book-audit-${report.runId.slice(0, 8)}`,
  );
  const jsonPath = path.join(dir, `${base}.json`);
  const htmlPath = path.join(dir, `${base}.html`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(htmlPath, renderAuditReportHtml(report), 'utf8');
  return { jsonPath, htmlPath };
}
