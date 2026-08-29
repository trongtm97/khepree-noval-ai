import { describe, expect, it } from 'vitest';
import {
  evaluateAutoSetupOutcome,
  mergeAutoSetupResult,
} from '../../../src/main/ai/ai-auto-setup-policy';

describe('AiAutoSetup policy', () => {
  it('requests add_account when no Google account exists', () => {
    const verdict = evaluateAutoSetupOutcome({
      usableAccountCount: 0,
      needsLogin: false,
      hasAnyAccount: false,
      geminiOk: false,
      workerOk: false,
    });
    expect(verdict.outcome).toBe('action_required');
    expect(verdict.action).toBe('add_account');
  });

  it('requests login when accounts exist but need re-auth', () => {
    const verdict = evaluateAutoSetupOutcome({
      usableAccountCount: 0,
      needsLogin: true,
      hasAnyAccount: true,
      geminiOk: false,
      workerOk: true,
    });
    expect(verdict.outcome).toBe('action_required');
    expect(verdict.action).toBe('login');
    expect(verdict.message).toContain('Đăng nhập');
  });

  it('reports ready when Gemini responds', () => {
    const verdict = evaluateAutoSetupOutcome({
      usableAccountCount: 1,
      needsLogin: false,
      hasAnyAccount: true,
      geminiOk: true,
      workerOk: true,
    });
    expect(verdict.outcome).toBe('ready');
    expect(verdict.title).toContain('sẵn sàng');
  });

  it('reports failure when worker and Gemini both down', () => {
    const verdict = evaluateAutoSetupOutcome({
      usableAccountCount: 1,
      needsLogin: false,
      hasAnyAccount: true,
      geminiOk: false,
      workerOk: false,
    });
    expect(verdict.outcome).toBe('failed');
    expect(verdict.title).toContain('Không thể khởi động Gemini');
  });

  it('mergeAutoSetupResult attaches steps and technical fields', () => {
    const merged = mergeAutoSetupResult(
      [{ id: 'google_accounts', ok: true, message: '1 account' }],
      { workerInstalled: true },
      {
        usableAccountCount: 1,
        needsLogin: false,
        hasAnyAccount: true,
        geminiOk: true,
        workerOk: true,
      },
    );
    expect(merged.steps).toHaveLength(1);
    expect(merged.technical?.workerInstalled).toBe(true);
    expect(merged.outcome).toBe('ready');
  });
});
