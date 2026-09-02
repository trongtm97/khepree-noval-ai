#!/usr/bin/env node
/**
 * Gate for Real Notebook grounding smoke. Refuses without explicit opt-in.
 *
 *   set KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE=1
 *   npm run test:notebook-grounding-smoke
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enabled = ['1', 'true', 'yes'].includes(
  String(
    process.env.KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE ??
      process.env.KHEPREE_NOVEL_AI_GOOGLE_SMOKE ??
      '',
  )
    .trim()
    .toLowerCase(),
);

if (!enabled) {
  console.error(`
Real Notebook grounding smoke is OPT-IN and never runs in default CI.

1. Copy google-smoke.config.example.json → google-smoke.config.json
2. Set profilePath to a logged-in Khepree Novel AI browser profile
3. Set notebookUrl to a dedicated SMOKE NotebookLM notebook (not production)
4. Connect Drive on the worker account (needed for Test B + D live update)
5. set KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE=1
6. npm run test:notebook-grounding-smoke

See docs/REAL_NOTEBOOK_GROUNDING_REPORT.md
`);
  process.exit(2);
}

const configPath =
  process.env.KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE_CONFIG?.trim() ||
  process.env.KHEPREE_NOVEL_AI_GOOGLE_SMOKE_CONFIG?.trim() ||
  path.join(root, 'google-smoke.config.json');

if (!fs.existsSync(configPath)) {
  console.error(`Missing ${configPath}`);
  console.error('Copy google-smoke.config.example.json first.');
  process.exit(2);
}

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', '--config', 'vitest.notebook-grounding-smoke.config.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE: '1',
    },
    shell: process.platform === 'win32',
  },
);

process.exit(result.status ?? 1);
