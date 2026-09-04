import { describe, expect, it } from 'vitest';
import { PRIMARY_NAV } from '@renderer/layouts/primary-nav';
import fs from 'node:fs';
import path from 'node:path';

/**
 * HARD REQUIREMENT 17 — Dịch immediately after Dự án in data order.
 * Same array drives desktop + collapsed/reduced-width sidebar (no CSS `order`).
 */
describe('HR17 primary nav order', () => {
  it('places translation immediately after projects', () => {
    const keys = PRIMARY_NAV.map((item) => item.key);
    const projectsIdx = keys.indexOf('nav.projects');
    const translationIdx = keys.indexOf('nav.translation');

    expect(projectsIdx).toBeGreaterThanOrEqual(0);
    expect(translationIdx).toBe(projectsIdx + 1);
  });

  it('preserves route / tab identifiers', () => {
    const byKey = Object.fromEntries(PRIMARY_NAV.map((item) => [item.key, item.to]));
    expect(byKey['nav.projects']).toBe('/projects');
    expect(byKey['nav.translation']).toBe('__translation__');
    expect(byKey['nav.dashboard']).toBe('/');
    expect(byKey['nav.series']).toBe('/series');
    expect(byKey['nav.search']).toBe('/search');
    expect(byKey['nav.production']).toBe('/jobs');
  });

  it('does not use CSS order on sidebar nav links', () => {
    const cssPath = path.resolve(
      process.cwd(),
      'src/renderer/styles/global.css',
    );
    const css = fs.readFileSync(cssPath, 'utf8');
    const navRelated = css
      .split(/(?=\n\.)/)
      .filter((block) => /\.sidebar-nav|\.nav-link/.test(block));
    for (const block of navRelated) {
      expect(block).not.toMatch(/\border\s*:/);
    }
  });
});
