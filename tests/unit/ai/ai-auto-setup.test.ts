import { describe, expect, it } from 'vitest';
import {
  evaluateAutoSetupOutcome,
  mergeAutoSetupResult,
} from '../../../src/main/ai/ai-auto-setup-policy';

describe('AiAutoSetup policy', () => {
  it('requests add_account when no AI account exists', () => {
    const verdict = evaluateAutoSetupOutcome({
      preference: 'AUTO',
      providerReady: { GEMINI: false, CHATGPT: false, META_AI: false },
      anyAccount: false,
      usableAccountCount: 0,
      needsLogin: null,
      workerOk: false,
      anyProviderOk: false,
    });
    expect(verdict.outcome).toBe('action_required');
    expect(verdict.action).toBe('add_account');
  });

  it('requests login when accounts exist but need re-auth', () => {
    const verdict = evaluateAutoSetupOutcome({
      preference: 'AUTO',
      providerReady: { GEMINI: false, CHATGPT: false, META_AI: false },
      anyAccount: true,
      usableAccountCount: 0,
      needsLogin: 'GEMINI',
      workerOk: true,
      anyProviderOk: false,
    });
    expect(verdict.outcome).toBe('action_required');
    expect(verdict.action).toBe('login');
    expect(verdict.loginTarget).toBe('GEMINI');
  });

  it('reports ready when a provider responds', () => {
    const verdict = evaluateAutoSetupOutcome({
      preference: 'AUTO',
      providerReady: { GEMINI: true, CHATGPT: false, META_AI: false },
      anyAccount: true,
      usableAccountCount: 1,
      needsLogin: null,
      workerOk: true,
      anyProviderOk: true,
    });
    expect(verdict.outcome).toBe('ready');
    expect(verdict.title).toContain('sẵn sàng');
  });

  it('reports failure when worker and providers both down', () => {
    const verdict = evaluateAutoSetupOutcome({
      preference: 'AUTO',
      providerReady: { GEMINI: false, CHATGPT: false, META_AI: false },
      anyAccount: true,
      usableAccountCount: 1,
      needsLogin: null,
      workerOk: false,
      anyProviderOk: false,
    });
    expect(verdict.outcome).toBe('failed');
  });

  it('mergeAutoSetupResult attaches steps and technical fields', () => {
    const merged = mergeAutoSetupResult(
      [{ id: 'ai_accounts', ok: true, message: '1 account' }],
      { workerInstalled: true },
      {
        preference: 'AUTO',
        providerReady: { GEMINI: true, CHATGPT: false, META_AI: false },
        anyAccount: true,
        usableAccountCount: 1,
        needsLogin: null,
        workerOk: true,
        anyProviderOk: true,
      },
    );
    expect(merged.steps).toHaveLength(1);
    expect(merged.technical?.workerInstalled).toBe(true);
    expect(merged.outcome).toBe('ready');
  });
});
