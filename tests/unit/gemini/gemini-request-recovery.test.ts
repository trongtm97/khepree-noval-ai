import { describe, expect, it } from 'vitest';
import {
  classifyCrashLifecycle,
  planGeminiRequestRecovery,
  type GeminiRecoveryProbe,
} from '@main/gemini/gemini-request-recovery';
import type { GeminiRequestLifecycle } from '@shared/constants/gemini';

const baseProbe = (over: Partial<GeminiRecoveryProbe> = {}): GeminiRecoveryProbe => ({
  markerFound: false,
  generationActive: false,
  responseComplete: false,
  rawCaptured: false,
  parsed: false,
  ...over,
});

describe('planGeminiRequestRecovery — crash points (no duplicate send)', () => {
  it('before send (CREATED): may resend only if marker absent', () => {
    const plan = planGeminiRequestRecovery('CREATED', baseProbe());
    expect(plan.action).toBe('resend');
  });

  it('before send but marker already on page: never resend', () => {
    const plan = planGeminiRequestRecovery(
      'CREATED',
      baseProbe({ markerFound: true, generationActive: true }),
    );
    expect(plan.action).not.toBe('resend');
    expect(plan.action).toBe('wait_generation');
  });

  it('after click (SEND_CLICKED): resend only if marker proven absent', () => {
    expect(
      planGeminiRequestRecovery('SEND_CLICKED', baseProbe()).action,
    ).toBe('resend');
    expect(
      planGeminiRequestRecovery(
        'SEND_CLICKED',
        baseProbe({ markerFound: true }),
      ).action,
    ).not.toBe('resend');
  });

  it('after SENT_CONFIRMED: never resend even if marker missing', () => {
    const plan = planGeminiRequestRecovery('SENT_CONFIRMED', baseProbe());
    expect(plan.action).toBe('search_thread');
    expect(plan.action).not.toBe('resend');
  });

  it('after SENT_CONFIRMED with marker + streaming: wait, no resend', () => {
    const plan = planGeminiRequestRecovery(
      'SENT_CONFIRMED',
      baseProbe({ markerFound: true, generationActive: true }),
    );
    expect(plan.action).toBe('wait_generation');
  });

  it('during streaming (GENERATION_STARTED): wait, no resend', () => {
    const plan = planGeminiRequestRecovery(
      'GENERATION_STARTED',
      baseProbe({ markerFound: true, generationActive: true }),
    );
    expect(plan.action).toBe('wait_generation');
    expect(plan.action).not.toBe('resend');
  });

  it('after response complete: capture only', () => {
    const plan = planGeminiRequestRecovery(
      'RESPONSE_SEEN',
      baseProbe({ markerFound: true, responseComplete: true }),
    );
    expect(plan.action).toBe('capture_response');
  });

  it('after response captured / before DB parse: parse_existing, no resend', () => {
    const plan = planGeminiRequestRecovery(
      'RESPONSE_CAPTURED',
      baseProbe({ rawCaptured: true }),
    );
    expect(plan.action).toBe('parse_existing');
    expect(plan.action).not.toBe('resend');
  });

  it('UNKNOWN_AFTER_CRASH: never resend', () => {
    const plan = planGeminiRequestRecovery(
      'UNKNOWN_AFTER_CRASH',
      baseProbe({ markerFound: true, responseComplete: true }),
    );
    expect(plan.action).toBe('capture_response');
    expect(
      planGeminiRequestRecovery('UNKNOWN_AFTER_CRASH', baseProbe()).action,
    ).toBe('search_thread');
  });

  it('COMPOSER_FILLED crash: may resend if no marker', () => {
    expect(planGeminiRequestRecovery('COMPOSER_FILLED', baseProbe()).action).toBe(
      'resend',
    );
  });
});

describe('classifyCrashLifecycle', () => {
  const cases: [GeminiRequestLifecycle, string][] = [
    ['CREATED', 'abandon_before_send'],
    ['COMPOSER_FILLED', 'abandon_before_send'],
    ['SEND_CLICKED', 'abandon_before_send'],
    ['SENT_CONFIRMED', 'unknown_after_sent'],
    ['GENERATION_STARTED', 'unknown_after_sent'],
    ['RESPONSE_SEEN', 'unknown_after_sent'],
    ['RESPONSE_CAPTURED', 'unknown_after_sent'],
    ['UNKNOWN_AFTER_CRASH', 'unknown_after_sent'],
    ['COMPLETED', 'terminal'],
    ['FAILED', 'terminal'],
  ];

  for (const [lifecycle, expected] of cases) {
    it(`${lifecycle} → ${expected}`, () => {
      expect(classifyCrashLifecycle(lifecycle)).toBe(expected);
    });
  }
});
