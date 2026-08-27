import { describe, expect, it } from 'vitest';
import {
  AutomationTimeline,
  timelineStepForOperation,
  AUTOMATION_TIMELINE_STEPS,
} from '@main/automation/automation-timeline';
import { shouldEnableFailTrace } from '@main/automation/playwright-tracing';
import { redactDiagnosticText } from '@main/automation/diagnostics';

describe('AutomationTimeline', () => {
  it('records ordered steps and describeFailure', () => {
    const tl = new AutomationTimeline('corr-1');
    tl.mark('SURFACE_DETECTED', { surface: 'NOTEBOOKLM_CHAT' });
    tl.mark('NOTEBOOK_VERIFIED');
    tl.mark('COMPOSER_FOUND');
    tl.fail('PROMPT_FILLED', 'composer rejected', { code: 'COMPOSER_FILL_FAILED' });

    const snap = tl.snapshot();
    expect(snap.lastOkStep).toBe('COMPOSER_FOUND');
    expect(snap.failedStep).toBe('PROMPT_FILLED');
    expect(tl.describeFailure()).toContain('Failed at PROMPT_FILLED');
    expect(tl.describeFailure()).toContain('COMPOSER_FOUND');
    expect(AUTOMATION_TIMELINE_STEPS).toContain('CAPTURED');
  });

  it('redacts secret keys in detail', () => {
    const tl = new AutomationTimeline();
    tl.mark('SURFACE_DETECTED', { cookie: 'SECRET', ok: true });
    const entry = tl.snapshot().entries[0];
    expect(entry.detail?.cookie).toBe('[REDACTED]');
    expect(entry.detail?.ok).toBe(true);
  });

  it('maps operations to timeline steps', () => {
    expect(timelineStepForOperation('promptInput')).toBe('COMPOSER_FOUND');
    expect(timelineStepForOperation('sendConfirm')).toBe('SEND_CONFIRMED');
    expect(timelineStepForOperation('waitForGenerationComplete')).toBe('RESPONSE_STABLE');
  });
});

describe('shouldEnableFailTrace', () => {
  it('off by default; on for retry/force', () => {
    expect(shouldEnableFailTrace({})).toBe(false);
    expect(shouldEnableFailTrace({ attempt: 1 })).toBe(false);
    expect(shouldEnableFailTrace({ attempt: 2 })).toBe(true);
    expect(shouldEnableFailTrace({ isRetry: true })).toBe(true);
    expect(shouldEnableFailTrace({ force: true })).toBe(true);
  });
});

describe('redactDiagnosticText', () => {
  it('never leaves bearer tokens', () => {
    expect(redactDiagnosticText('Authorization: Bearer abc.def')).toContain('[REDACTED]');
    expect(redactDiagnosticText('password":"hunter2"')).toContain('[REDACTED]');
  });
});
