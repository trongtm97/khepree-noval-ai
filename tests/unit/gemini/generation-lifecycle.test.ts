import { describe, expect, it } from 'vitest';
import {
  detectGenerationUiError,
  detectOutputIncomplete,
  runTargetGenerationLifecycle,
} from '@main/automation/providers/google/generation-lifecycle';
import type { Locator } from 'playwright';

describe('detectGenerationUiError', () => {
  it('ignores protocol-shaped translation text', () => {
    expect(
      detectGenerationUiError(
        '<TRANSLATION>\n[C000001:P000001] ok\n</TRANSLATION>',
      ),
    ).toBeNull();
  });

  it('maps common AI-side failures', () => {
    expect(detectGenerationUiError('Network error. Failed to fetch.')).toBe(
      'NETWORK_ERROR',
    );
    expect(detectGenerationUiError('Something went wrong. Please try again.')).toBe(
      'GENERATION_ERROR',
    );
    expect(detectGenerationUiError('Response blocked. Generation stopped.')).toBe(
      'GENERATION_ERROR',
    );
    expect(detectGenerationUiError('Quota limit reached')).toBe('QUOTA_LIMIT');
    expect(detectGenerationUiError('Login required — sign in')).toBe('LOGIN_REQUIRED');
  });
});

describe('detectOutputIncomplete', () => {
  it('flags missing </TRANSLATION>', () => {
    expect(
      detectOutputIncomplete('<TRANSLATION>\n[C000001:P000001] hello'),
    ).toBe(true);
  });

  it('flags truncated paragraph IDs', () => {
    expect(
      detectOutputIncomplete(
        '<TRANSLATION>\n[C000001:P000001] a\n[C000001:P00000',
      ),
    ).toBe(true);
  });

  it('flags truncated JSON in TERM_DELTA', () => {
    expect(
      detectOutputIncomplete(
        '<TRANSLATION>\nx\n</TRANSLATION>\n<TERM_DELTA>\n[{"term":"a",',
      ),
    ).toBe(true);
  });

  it('accepts complete protocol', () => {
    expect(
      detectOutputIncomplete(
        '<TRANSLATION>\n[C000001:P000001] ok\n</TRANSLATION>\n<TERM_DELTA>[]</TERM_DELTA>',
      ),
    ).toBe(false);
  });
});

describe('runTargetGenerationLifecycle', () => {
  it('waits through pause then completes on stable non-empty text', async () => {
    const phases: string[] = [];
    let text = '';
    let indicator: boolean | null = true;
    const started = Date.now();

    const growth = setInterval(() => {
      const elapsed = Date.now() - started;
      if (elapsed < 200) {
        text = `<TRANSLATION>\n${'a'.repeat(Math.floor(elapsed / 20))}`;
      } else if (elapsed < 2200) {
        // pause — text unchanged
        indicator = false;
      } else if (elapsed < 2600) {
        text =
          '<TRANSLATION>\n[C000001:P000001] Bản dịch thử nghiệm.\n</TRANSLATION>\n<TERM_DELTA>[]</TERM_DELTA>';
        indicator = false;
      }
    }, 30);

    try {
      const result = await runTargetGenerationLifecycle({
        maxTimeoutMs: 8_000,
        stabilizationWindowMs: 250,
        noIndicatorStabilizationWindowMs: 250,
        pollIntervalMs: 40,
        initialPhase: 'RESPONSE_CREATED',
        resolveTarget: () => Promise.resolve({} as unknown as Locator),
        readTargetText: () => Promise.resolve(text),
        readGeneratingIndicator: () => Promise.resolve(indicator),
        onPhase: (p) => phases.push(p),
      });
      expect(result.text).toContain('</TRANSLATION>');
      expect(phases).toContain('RESPONSE_STREAMING');
      expect(phases).toContain('RESPONSE_STABILIZING');
      expect(phases).toContain('RESPONSE_COMPLETE');
    } finally {
      clearInterval(growth);
    }
  }, 12_000);

  it('returns OUTPUT_INCOMPLETE for cutoff protocol', async () => {
    await expect(
      runTargetGenerationLifecycle({
        maxTimeoutMs: 1_200,
        stabilizationWindowMs: 150,
        noIndicatorStabilizationWindowMs: 150,
        pollIntervalMs: 30,
        initialPhase: 'RESPONSE_CREATED',
        resolveTarget: () => Promise.resolve({} as unknown as Locator),
        readTargetText: () =>
          Promise.resolve(
            '<TRANSLATION>\n[C000001:P000001] cut\n[C000001:P00000',
          ),
        readGeneratingIndicator: () => Promise.resolve(false),
      }),
    ).rejects.toMatchObject({ code: 'OUTPUT_INCOMPLETE' });
  }, 4_000);

  it('returns GENERATION_ERROR for in-bubble failure copy', async () => {
    await expect(
      runTargetGenerationLifecycle({
        maxTimeoutMs: 2_000,
        stabilizationWindowMs: 100,
        pollIntervalMs: 30,
        initialPhase: 'RESPONSE_CREATED',
        resolveTarget: () => Promise.resolve({} as unknown as Locator),
        readTargetText: () => Promise.resolve('Something went wrong. Please retry.'),
        readGeneratingIndicator: () => Promise.resolve(false),
      }),
    ).rejects.toMatchObject({ code: 'GENERATION_ERROR' });
  }, 5_000);

  it('uses longer quiet window when indicator is null', async () => {
    const text =
      '<TRANSLATION>\n[C000001:P000001] ok\n</TRANSLATION>\n<TERM_DELTA>[]</TERM_DELTA>';
    const t0 = Date.now();
    await runTargetGenerationLifecycle({
      maxTimeoutMs: 5_000,
      stabilizationWindowMs: 80,
      noIndicatorStabilizationWindowMs: 400,
      pollIntervalMs: 40,
      initialPhase: 'RESPONSE_CREATED',
      resolveTarget: () => Promise.resolve({} as unknown as Locator),
      readTargetText: () => Promise.resolve(text),
      readGeneratingIndicator: () => Promise.resolve(null),
    });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
  }, 6_000);
});
