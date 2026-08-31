import { describe, expect, it } from 'vitest';
import type { JobAttemptDto, JobDto } from '@shared/schemas/job';
import {
  formatAttemptProviderChain,
  jobProviderLabel,
  readJobFallbackNotice,
  routingPreferenceLabel,
} from '../../../src/renderer/features/jobs/job-provider-ui';

const t = (key: string, params?: Record<string, string>) => {
  if (key === 'translation.jobFallbackSwitched' && params) {
    return `Switched to ${params.to} to continue.`;
  }
  if (key === 'settings.aiPreferenceAuto') return 'Automatic';
  if (key === 'settings.aiPreferenceChatGpt') return 'ChatGPT';
  if (key === 'jobs.attemptUnknownProvider') return 'Unknown';
  return key;
};

describe('jobProviderLabel', () => {
  it('maps provider type to user-facing label', () => {
    const job = {
      progress: { providerType: 'PLAYWRIGHT_CHATGPT' },
    } as JobDto;
    expect(jobProviderLabel(job)).toBe('ChatGPT');
  });
});

describe('routingPreferenceLabel', () => {
  it('returns AUTO label', () => {
    expect(routingPreferenceLabel('AUTO', t)).toBe('Automatic');
  });
});

describe('readJobFallbackNotice', () => {
  it('reads custom timeline message', () => {
    const job = {
      progress: {
        timeline: [{ event: 'provider_fallback', message: 'Đã chuyển sang Meta AI để tiếp tục.' }],
      },
    } as JobDto;
    expect(readJobFallbackNotice(job, t)).toBe('Đã chuyển sang Meta AI để tiếp tục.');
  });

  it('parses from:to detail', () => {
    const job = {
      progress: {
        timeline: [{ event: 'provider_fallback', detail: 'from:PLAYWRIGHT_CHATGPT to:PLAYWRIGHT_META_AI' }],
      },
    } as JobDto;
    expect(readJobFallbackNotice(job, t)).toBe('Switched to Meta AI to continue.');
  });
});

describe('formatAttemptProviderChain', () => {
  it('builds provider state rows', () => {
    const attempts = [
      { providerType: 'PLAYWRIGHT_CHATGPT', state: 'TIMEOUT' },
      { providerType: 'PLAYWRIGHT_META_AI', state: 'SUCCESS' },
    ] as JobAttemptDto[];
    expect(formatAttemptProviderChain(attempts, t)).toEqual([
      { provider: 'ChatGPT', state: 'TIMEOUT' },
      { provider: 'Meta AI', state: 'SUCCESS' },
    ]);
  });
});
