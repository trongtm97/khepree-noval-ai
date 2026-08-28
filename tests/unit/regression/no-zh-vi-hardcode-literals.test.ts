/**
 * Static guard: production source must not reintroduce zh→vi hardcodes
 * or preferred_vi prompt fields outside legacy schema adapters / tests / docs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');

const BANNED = [
  {
    name: 'Translate Chinese → Vietnamese',
    re: /Translate Chinese\s*[→\-–—]\s*Vietnamese/,
  },
  {
    name: 'Chinese→Vietnamese novel translation project',
    re: /Chinese\s*[→\-–—]\s*Vietnamese novel translation project/,
  },
  {
    name: 'preferred_vi',
    re: /preferred_vi/,
  },
  {
    name: 'into Vietnamese (prompt hardcode)',
    re: /into Vietnamese/,
  },
] as const;

/** Paths under src/ that may still mention preferred_vi (DB/JSON compat only). */
const PREFERRED_VI_ALLOWLIST = new Set([
  path.normalize('src/shared/schemas/bootstrap.ts'),
]);

/** Smoke / opt-in harnesses under src/main — not product prompt builders. */
const SMOKE_ALLOW_PREFIXES = [
  path.normalize('src/main/google-smoke/'),
  path.normalize('src/main/notebook-grounding-smoke/'),
];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'out') {
        continue;
      }
      walkTsFiles(abs, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(abs);
    }
  }
  return out;
}

function relPosix(abs: string): string {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

function isSmokePath(rel: string): boolean {
  const n = path.normalize(rel);
  return SMOKE_ALLOW_PREFIXES.some((p) => n.startsWith(p));
}

describe('regression: no zh→vi / preferred_vi hardcodes in production src', () => {
  const files = [
    ...walkTsFiles(path.join(ROOT, 'src/main')),
    ...walkTsFiles(path.join(ROOT, 'src/renderer')),
    ...walkTsFiles(path.join(ROOT, 'src/shared')),
    ...walkTsFiles(path.join(ROOT, 'src/preload')),
  ];

  it('scans production TypeScript sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const rule of BANNED) {
    it(`forbids literal: ${rule.name}`, () => {
      const hits: string[] = [];
      for (const abs of files) {
        const rel = relPosix(abs);
        if (isSmokePath(rel)) continue;
        if (rule.name === 'preferred_vi' && PREFERRED_VI_ALLOWLIST.has(path.normalize(rel))) {
          continue;
        }
        const src = fs.readFileSync(abs, 'utf8');
        // Strip comments so docstrings mentioning bans do not fail the scan.
        const code = src
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        if (rule.re.test(code)) {
          hits.push(rel);
        }
      }
      expect(hits, hits.join('\n')).toEqual([]);
    });
  }
});
