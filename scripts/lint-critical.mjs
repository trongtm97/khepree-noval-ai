/**
 * Critical lint gate — Priority A runtime-risk rules only.
 * Does not fail on historical no-non-null-assertion debt.
 *
 * Usage: node scripts/lint-critical.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CRITICAL_RULES = new Set([
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/no-confusing-void-expression',
  '@typescript-eslint/no-misused-promises',
]);

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['eslint', 'src', 'tests', '*.config.ts', '-f', 'json', '-o', 'lint-critical-raw.json'],
  { cwd: root, encoding: 'utf8', shell: true },
);

// ESLint exits 1 when any configured rule fails — we re-filter.
let report;
try {
  const fs = await import('node:fs');
  report = JSON.parse(fs.readFileSync(path.join(root, 'lint-critical-raw.json'), 'utf8'));
} catch (err) {
  console.error('Critical lint: failed to read eslint JSON report.');
  console.error(result.stderr || result.stdout || err);
  process.exit(1);
}

const hits = [];
for (const file of report) {
  for (const msg of file.messages ?? []) {
    if (msg.ruleId && CRITICAL_RULES.has(msg.ruleId)) {
      hits.push({
        file: path.relative(root, file.filePath).split(path.sep).join('/'),
        line: msg.line,
        rule: msg.ruleId,
        message: msg.message,
      });
    }
  }
}

const byRule = {};
for (const h of hits) {
  byRule[h.rule] = (byRule[h.rule] ?? 0) + 1;
}

console.log('Critical lint (Priority A):');
for (const rule of CRITICAL_RULES) {
  console.log(`  ${byRule[rule] ?? 0}\t${rule}`);
}
console.log(`  TOTAL\t${hits.length}`);

if (hits.length > 0) {
  console.log('\nFindings:');
  for (const h of hits.slice(0, 50)) {
    console.log(`  ${h.file}:${h.line}  ${h.rule}`);
  }
  if (hits.length > 50) console.log(`  … +${hits.length - 50} more`);
  process.exit(1);
}

console.log('PASS — no Priority A violations.');
process.exit(0);
