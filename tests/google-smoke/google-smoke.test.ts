/**
 * Opt-in Real Google smoke suite.
 * Skips unless NOVELTRANS_GOOGLE_SMOKE=1.
 * Never included in default `npm test` (see vitest.config.ts exclude).
 */

import { describe, expect, it } from 'vitest';
import { isGoogleSmokeEnvEnabled } from '@main/google-smoke/google-smoke-config';
import { runGoogleSmoke } from '@main/google-smoke/google-smoke-runner';

const enabled = isGoogleSmokeEnvEnabled();

describe.skipIf(!enabled)('Real Google smoke (opt-in)', () => {
  it(
    'runs scenarios A–H against logged-in profile',
    async () => {
      const report = await runGoogleSmoke();
      expect(report.overall).toBe('PASS');
    },
    30 * 60_000,
  );
});

describe.skipIf(enabled)('Real Google smoke gate', () => {
  it('documents that suite is disabled without env', () => {
    expect(isGoogleSmokeEnvEnabled()).toBe(false);
  });
});
