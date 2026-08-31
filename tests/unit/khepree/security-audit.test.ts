import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(REPO_ROOT, 'src');

function readAllTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      out.push(...readAllTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(fs.readFileSync(full, 'utf8'));
    }
  }
  return out;
}

describe('Khepree security audit (N08)', () => {
  const rendererSources = readAllTsFiles(path.join(SRC, 'renderer')).join('\n');
  const mainSources = readAllTsFiles(path.join(SRC, 'main', 'khepree')).join('\n');

  it('renderer has no licensed=true bypass', () => {
    expect(rendererSources).not.toMatch(/licensed\s*=\s*true/i);
    expect(rendererSources).not.toMatch(/licensed:\s*true/i);
  });

  it('renderer does not call Khepree API directly', () => {
    expect(rendererSources).not.toMatch(/api\.khepree\.com/);
    expect(rendererSources).not.toMatch(/fetch\s*\(\s*['"`]https:\/\/account\.khepree/);
  });

  it('renderer khepree preload surface has no token channels', () => {
    const preload = fs.readFileSync(path.join(SRC, 'preload', 'preload.ts'), 'utf8');
    const block = /khepree:\s*\{([\s\S]*?)\n\s*\},/.exec(preload)?.[1] ?? '';
    expect(block).not.toMatch(/accessToken|refreshToken|privateKey/i);
  });

  it('main khepree does not log raw tokens in logger calls', () => {
    expect(mainSources).not.toMatch(/logger\.(info|warn|error|debug)\([^)]*accessToken/);
    expect(mainSources).not.toMatch(/logger\.(info|warn|error|debug)\([^)]*refreshToken/);
  });

  it('forge config enables production electron fuses', () => {
    const forge = fs.readFileSync(path.join(REPO_ROOT, 'forge.config.ts'), 'utf8');
    expect(forge).toContain('[FuseV1Options.RunAsNode]: false');
    expect(forge).toContain('[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false');
    expect(forge).toContain('[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true');
    expect(forge).toContain('[FuseV1Options.OnlyLoadAppFromAsar]: true');
  });

  it('window security blocks webview and restricts external protocols', () => {
    const ws = fs.readFileSync(path.join(SRC, 'main', 'app', 'window-security.ts'), 'utf8');
    expect(ws).toContain('will-attach-webview');
    expect(ws).toContain('preventDefault()');
    expect(ws).toContain("'https:'");
    expect(ws).not.toContain("'http:'");
  });

  it('DevTools only open with Vite dev server', () => {
    const cw = fs.readFileSync(path.join(SRC, 'main', 'app', 'create-window.ts'), 'utf8');
    expect(cw).toMatch(/MAIN_WINDOW_VITE_DEV_SERVER_URL[\s\S]*openDevTools/);
  });
});

describe('resolveTrustedSigningKey packaged behavior', () => {
  it('ignores dev signing keys when packaged', async () => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      app: { isPackaged: true, getLocale: () => 'en-US' },
    }));
    process.env.KHEPREE_DEV_MOCK = '1';
    const { resolveTrustedSigningKey } = await import('@main/khepree/config');
    expect(resolveTrustedSigningKey('dev-local')).toBeNull();
    vi.resetModules();
  });
});
