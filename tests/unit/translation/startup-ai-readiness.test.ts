import { describe, expect, it } from 'vitest';
import { evaluateStartupAiReadiness } from '../../../src/renderer/utils/startup-ai-readiness';

describe('evaluateStartupAiReadiness', () => {
  const ready = {
    googleAccounts: [{ status: 'READY' }],
    webApiHealth: { ok: true, status: 'READY', message: 'ok' },
    webApiAccounts: [{ status: 'READY' }],
    workerRunning: true,
    hasEnabledProvider: true,
  };

  it('ok when Google + Web API ready', () => {
    expect(evaluateStartupAiReadiness(ready)).toEqual({ ok: true, issues: [] });
  });

  it('ok when health says ok even if list workerRunning false', () => {
    const result = evaluateStartupAiReadiness({
      ...ready,
      workerRunning: false,
    });
    expect(result.ok).toBe(true);
  });

  it('fails no_google_account', () => {
    const result = evaluateStartupAiReadiness({
      ...ready,
      googleAccounts: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('no_google_account');
  });

  it('fails google_needs_login', () => {
    const result = evaluateStartupAiReadiness({
      ...ready,
      googleAccounts: [{ status: 'LOGIN_REQUIRED' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('google_needs_login');
  });

  it('fails web_api_not_ready with health detail', () => {
    const result = evaluateStartupAiReadiness({
      ...ready,
      webApiHealth: {
        ok: false,
        status: 'ERROR',
        message: 'Worker health check failed: HTTP 401',
      },
      webApiAccounts: [{ status: 'READY' }],
      workerRunning: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain('web_api_not_ready');
      expect(result.detail).toContain('HTTP 401');
    }
  });

  it('web api ready via workerRunning + account when health missing', () => {
    const result = evaluateStartupAiReadiness({
      ...ready,
      webApiHealth: null,
      workerRunning: true,
      webApiAccounts: [{ status: 'READY' }],
    });
    expect(result.ok).toBe(true);
  });

  it('fails no_ai_provider when none enabled', () => {
    const result = evaluateStartupAiReadiness({
      ...ready,
      hasEnabledProvider: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('no_ai_provider');
  });

  it('ignores workerEnabled=false google accounts', () => {
    const result = evaluateStartupAiReadiness({
      ...ready,
      googleAccounts: [{ status: 'READY', workerEnabled: false }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('no_google_account');
  });
});
