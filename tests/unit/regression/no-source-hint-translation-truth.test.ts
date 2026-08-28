/**
 * Static guard: user source hint must never be used as translation source of truth.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');

/** Hint may appear only in detection/import/UI layers — never translation engine. */
const HINT_ALLOWLIST = new Set([
  path.normalize('src/main/source-folder/source-folder-service.ts'),
  path.normalize('src/main/services/source-language-import.ts'),
  path.normalize('src/main/services/source-language-redetect.ts'),
  path.normalize('src/main/services/project-dto.ts'),
  path.normalize('src/main/db/repositories/project-repository.ts'),
  path.normalize('src/main/ipc/register-handlers.ts'),
  path.normalize('src/shared/schemas/import.ts'),
  path.normalize('src/shared/schemas/source-folder.ts'),
  path.normalize('src/shared/schemas/source-language.ts'),
  path.normalize('src/shared/types/ipc.ts'),
  path.normalize('src/preload/preload.ts'),
]);

const HINT_PATTERNS = [/sourceLanguageHint/, /source_language_hint/] as const;

/** Must never use hint as translation source. */
const TRANSLATION_ENGINE_PREFIXES = [
  path.normalize('src/main/bootstrap/'),
  path.normalize('src/main/prompt/'),
  path.normalize('src/main/jobs/'),
  path.normalize('src/main/learning/'),
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

describe('regression: source hint is not translation truth', () => {
  const mainFiles = walkTsFiles(path.join(ROOT, 'src/main'));

  it('forbids sourceLanguageHint / source_language_hint outside allowlist in main', () => {
    const hits: string[] = [];
    for (const abs of mainFiles) {
      const rel = relPosix(abs);
      const normalized = path.normalize(rel);
      if (normalized.includes(`${path.sep}migrations${path.sep}`)) continue;
      if (HINT_ALLOWLIST.has(normalized)) continue;
      const text = fs.readFileSync(abs, 'utf8');
      for (const re of HINT_PATTERNS) {
        if (re.test(text)) hits.push(`${rel} (${re.source})`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('forbids hint patterns in translation engine paths', () => {
    const hits: string[] = [];
    for (const prefix of TRANSLATION_ENGINE_PREFIXES) {
      const abs = path.join(ROOT, prefix);
      if (!fs.existsSync(abs)) continue;
      for (const file of walkTsFiles(abs)) {
        const text = fs.readFileSync(file, 'utf8');
        for (const re of HINT_PATTERNS) {
          if (re.test(text)) hits.push(`${relPosix(file)} (${re.source})`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
