/**
 * Regression guard: Project/Notebook/Translation call sites must not
 * blind-pick first READY / accounts[0] / workers[0].
 * Use ProjectWorkerResolver (or projects.resolveWorker IPC) instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');

const GUARDED_FILES = [
  'src/renderer/pages/AiMemoryPage.tsx',
  'src/renderer/components/translation/AiStatusPanel.tsx',
  'src/renderer/pages/TranslationEditorPage.tsx',
  'src/main/notebook/notebook-bootstrap-service.ts',
  'src/main/services/translate-readiness-service.ts',
  'src/main/bootstrap/full-novel-preprocess-orchestrator.ts',
  'src/main/bootstrap/full-novel-preprocess-auto-service.ts',
  'src/main/services/project-dto.ts',
  'src/renderer/utils/translate-preflight.ts',
  'src/main/jobs/worker-pool.ts',
  'src/main/learning/learning-pipeline.ts',
];

/** Patterns that indicate blind first-READY / first-account selection. */
const FORBIDDEN = [
  {
    name: 'workers[0] account pick',
    re: /workers(?:\.workers)?\[0\]/,
  },
  {
    name: 'accounts[0] account pick',
    re: /accounts(?:\.accounts)?\[0\]/,
  },
  {
    name: 'find first READY worker for project pick',
    re: /\.find\(\s*\([^)]*\)\s*=>\s*[^)]*READY/,
  },
  {
    name: 'pickReadyWorkerAccountId helper',
    re: /pickReadyWorkerAccountId/,
  },
];

describe('regression: no first-READY project worker pick', () => {
  for (const rel of GUARDED_FILES) {
    it(`${rel} has no blind first-READY / [0] pick`, () => {
      const abs = path.join(ROOT, rel);
      expect(fs.existsSync(abs), `missing ${rel}`).toBe(true);
      const src = fs.readFileSync(abs, 'utf8');
      // Strip block + line comments so status literals in strings/docs don't trip us.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      for (const rule of FORBIDDEN) {
        expect(code, `${rel} matches forbidden: ${rule.name}`).not.toMatch(rule.re);
      }
    });
  }

  it('guarded files reference ProjectWorkerResolver or projects.resolveWorker', () => {
    for (const rel of GUARDED_FILES) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const ok =
        src.includes('resolveProjectWorker') ||
        src.includes('ProjectWorkerResolver') ||
        src.includes('projects.resolveWorker') ||
        src.includes('resolvedWorkerAccountId');
      expect(ok, `${rel} must use ProjectWorkerResolver / resolveWorker`).toBe(true);
    }
  });
});
