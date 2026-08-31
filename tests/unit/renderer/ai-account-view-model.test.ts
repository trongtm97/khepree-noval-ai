import { describe, expect, it } from 'vitest';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { AiAccountDto } from '@shared/schemas/ai-provider';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import {
  aiAccountToViewModel,
  computeUnifiedSummary,
  googleAccountToViewModel,
  matchesProviderFilter,
} from '../../../src/renderer/features/accounts/ai-account-view-model';

describe('AiAccountViewModel', () => {
  it('maps Google account to gemini view model', () => {
    const google = {
      id: 'g1',
      email: 'user@gmail.com',
      label: null,
      displayName: null,
      plan: 'PRO',
      status: 'READY',
      lastUsedAt: '2026-01-01T00:00:00Z',
      availability: {
        uiLane: 'ready',
        canPause: true,
        canRemove: true,
        activeJob: null,
      },
      assignedProjects: [],
      browserProfilePath: '/profiles/x',
    } as unknown as GoogleAccountDto;

    const vm = googleAccountToViewModel(google, 'Fallback');
    expect(vm.providerKind).toBe('gemini');
    expect(vm.displayName).toBe('user@gmail.com');
    expect(vm.statusLane).toBe('ready');
    expect(vm.planKey).toBe('accounts.planPro');
  });

  it('maps ChatGPT ai_account to view model', () => {
    const ai = {
      id: 'a1',
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      providerType: 'PLAYWRIGHT_CHATGPT',
      googleAccountId: null,
      googleEmail: null,
      displayName: 'ChatGPT 1',
      profileDirName: 'profile-1',
      sessionLocation: 'browser',
      status: 'READY',
      lastUsedAt: null,
      lastError: null,
      createdAt: '',
      updatedAt: '',
    } as AiAccountDto;

    const vm = aiAccountToViewModel(ai);
    expect(vm.providerKind).toBe('chatgpt');
    expect(vm.statusLane).toBe('ready');
  });

  it('computes unified summary across providers', () => {
    const summary = computeUnifiedSummary([
      { statusLane: 'ready' } as never,
      { statusLane: 'running' } as never,
      { statusLane: 'login' } as never,
    ]);
    expect(summary).toEqual({ ready: 1, busy: 1, paused: 0, needsAttention: 1 });
  });

  it('filters by provider kind', () => {
    const vm = { providerKind: 'chatgpt' } as never;
    expect(matchesProviderFilter(vm, 'chatgpt')).toBe(true);
    expect(matchesProviderFilter(vm, 'gemini')).toBe(false);
  });
});
