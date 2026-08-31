import { describe, expect, it } from 'vitest';
import {
  evaluateAutoSetupOutcome,
} from '../../../src/main/ai/ai-auto-setup-policy';

describe('AiAutoSetup policy (multi-provider)', () => {
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
    expect(verdict.title).toContain('tài khoản AI');
  });

  it('requests login with provider target', () => {
    const verdict = evaluateAutoSetupOutcome({
      preference: 'CHATGPT',
      providerReady: { GEMINI: false, CHATGPT: false, META_AI: false },
      anyAccount: true,
      usableAccountCount: 0,
      needsLogin: 'CHATGPT',
      workerOk: true,
      anyProviderOk: false,
    });
    expect(verdict.outcome).toBe('action_required');
    expect(verdict.action).toBe('login');
    expect(verdict.loginTarget).toBe('CHATGPT');
  });

  it('reports ready when any provider ok', () => {
    const verdict = evaluateAutoSetupOutcome({
      preference: 'AUTO',
      providerReady: { GEMINI: false, CHATGPT: true, META_AI: false },
      anyAccount: true,
      usableAccountCount: 1,
      needsLogin: null,
      workerOk: true,
      anyProviderOk: true,
    });
    expect(verdict.outcome).toBe('ready');
  });
});
