/**
 * lint:i18n — compare vi.ts / en.ts leaf key trees; fail on missing keys.
 * Usage: npm run lint:i18n
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function extractLeafKeys(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const startMatch = /export const (vi|en)(?::\s*\w+)?\s*=\s*\{/.exec(src);
  if (!startMatch) throw new Error(`No locale export in ${filePath}`);
  const start = startMatch.index + startMatch[0].length - 1;
  const keys = new Set();
  const stack = [];
  let depth = 0;
  let inStr = null;
  let escape = false;
  let ident = '';
  let collectingIdent = false;

  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      if (!collectingIdent) {
        collectingIdent = true;
        ident = ch;
      } else {
        ident += ch;
      }
      continue;
    }
    if (collectingIdent && /[A-Za-z0-9_]/.test(ch)) {
      ident += ch;
      continue;
    }
    if (collectingIdent) {
      let j = i;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === ':') {
        let k = j + 1;
        while (k < src.length && /\s/.test(src[k])) k++;
        if (src[k] === '{') {
          stack.push(ident);
        } else {
          keys.add([...stack, ident].join('.'));
        }
        collectingIdent = false;
        ident = '';
        i = j;
        continue;
      }
      collectingIdent = false;
      ident = '';
    }
    if (ch === '{') {
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (stack.length > 0 && depth >= 1) stack.pop();
      if (depth === 0) break;
    }
  }
  return keys;
}

const viKeys = extractLeafKeys(path.join(root, 'src/renderer/i18n/locales/vi/index.ts'));
const enKeys = extractLeafKeys(path.join(root, 'src/renderer/i18n/locales/en/index.ts'));

const missingInEn = [...viKeys].filter((k) => !enKeys.has(k)).sort();
const missingInVi = [...enKeys].filter((k) => !viKeys.has(k)).sort();

let failed = false;
if (missingInEn.length) {
  failed = true;
  console.error(`Missing in en.ts (${missingInEn.length}):`);
  for (const k of missingInEn.slice(0, 80)) console.error(`  - ${k}`);
  if (missingInEn.length > 80) console.error(`  … +${missingInEn.length - 80} more`);
}
if (missingInVi.length) {
  failed = true;
  console.error(`Missing in vi.ts (${missingInVi.length}):`);
  for (const k of missingInVi.slice(0, 80)) console.error(`  - ${k}`);
  if (missingInVi.length > 80) console.error(`  … +${missingInVi.length - 80} more`);
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`i18n OK — ${viKeys.size} keys matched (vi/en).`);
}
