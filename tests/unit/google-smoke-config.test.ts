import { describe, expect, it } from 'vitest';
import {
  assertNotProductionProject,
  parseGoogleSmokeConfig,
  isGoogleSmokeEnvEnabled,
} from '@main/google-smoke/google-smoke-config';

describe('google-smoke config guards', () => {
  it('refuses allowNonSmokeNotebook', () => {
    expect(() =>
      parseGoogleSmokeConfig({
        profilePath: 'C:/tmp/profile',
        notebookUrl: 'https://notebooklm.google.com/notebook/abc',
        smokeProjectLabel: 'NOVELTRANS_SMOKE',
        allowNonSmokeNotebook: true,
      }),
    ).toThrow(/forbidden/i);
  });

  it('requires SMOKE or TEST in label', () => {
    expect(() => { assertNotProductionProject({
        enabled: true,
        profilePath: 'C:/tmp/profile',
        notebookUrl: 'https://notebooklm.google.com/notebook/prod-novel',
        headless: false,
        smokeProjectLabel: 'MyRealNovel',
        scenarios: ['A'],
        reportMarkdownPath: 'docs/REAL_GOOGLE_TEST_REPORT.md',
        artifactsDir: 'tmp/x',
        allowNonSmokeNotebook: false,
      }); },
    ).toThrow(/SMOKE or TEST/);
  });

  it('accepts smoke label', () => {
    const cfg = parseGoogleSmokeConfig({
      profilePath: 'C:/tmp/profile',
      notebookUrl: 'https://notebooklm.google.com/notebook/smoke-id',
      smokeProjectLabel: 'NOVELTRANS_SMOKE',
    });
    expect(cfg.smokeProjectLabel).toContain('SMOKE');
  });

  it('is disabled without env (default CI)', () => {
    expect(isGoogleSmokeEnvEnabled()).toBe(false);
  });
});
