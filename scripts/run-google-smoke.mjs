#!/usr/bin/env node
/**
 * Gate for Real Google smoke. Refuses to run without explicit opt-in.
 *
 *   set NOVELTRANS_GOOGLE_SMOKE=1
 *   npm run test:google-smoke
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enabled = ['1', 'true', 'yes'].includes(
  String(process.env.NOVELTRANS_GOOGLE_SMOKE ?? '')
    .trim()
    .toLowerCase(),
);

if (!enabled) {
  console.error(`
Real Google smoke is OPT-IN and never runs in default CI.

1. Copy google-smoke.config.example.json → google-smoke.config.json
2. Set profilePath to a logged-in NovelTrans browser profile
3. Set notebookUrl to a dedicated SMOKE NotebookLM notebook (not production)
4. set NOVELTRANS_GOOGLE_SMOKE=1
5. npm run test:google-smoke

See docs/REAL_GOOGLE_TEST_REPORT.md
`);
  process.exit(2);
}

const configPath =
  process.env.NOVELTRANS_GOOGLE_SMOKE_CONFIG?.trim() ||
  path.join(root, 'google-smoke.config.json');

if (!fs.existsSync(configPath)) {
  console.error(`Missing ${configPath}`);
  console.error('Copy google-smoke.config.example.json first.');
  process.exit(2);
}

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', '--config', 'vitest.google-smoke.config.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NOVELTRANS_GOOGLE_SMOKE: '1',
    },
    shell: process.platform === 'win32',
  },
);

process.exit(result.status ?? 1);
