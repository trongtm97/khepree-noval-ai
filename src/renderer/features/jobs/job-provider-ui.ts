import type { JobAttemptDto, JobDto } from '@shared/schemas/job';
import type { AiPreference } from '@shared/constants/ai-preference';
import { userFacingProviderLabel } from '@shared/utils/ai-preference-label';
import { preferenceFromProviderId } from '@shared/constants/ai-preference';

export function jobProviderLabel(job: JobDto | null | undefined): string | null {
  return userFacingProviderLabel(job?.progress?.providerType);
}

export function routingPreferenceLabel(
  preference: AiPreference,
  t: (key: string) => string,
): string {
  switch (preference) {
    case 'AUTO':
      return t('settings.aiPreferenceAuto');
    case 'GEMINI':
      return t('settings.aiPreferenceGemini');
    case 'CHATGPT':
      return t('settings.aiPreferenceChatGpt');
    case 'META_AI':
      return t('settings.aiPreferenceMetaAi');
    default:
      return t('settings.aiPreferenceAuto');
  }
}

/** Brief non-blocking fallback notice from job progress timeline. */
export function readJobFallbackNotice(
  job: JobDto | null | undefined,
  t: (key: string, params?: Record<string, string>) => string,
): string | null {
  const timeline = job?.progress?.timeline;
  if (!timeline?.length) return null;

  for (let i = timeline.length - 1; i >= 0; i--) {
    const entry = timeline[i];
    if (entry.event !== 'provider_fallback') continue;
    const message = entry.message?.trim();
    if (message) return message;

    const match = /from:(\S+).*to:(\S+)/i.exec(entry.detail ?? entry.message ?? '');
    if (match) {
      const from = userFacingProviderLabel(match[1]) ?? match[1];
      const to = userFacingProviderLabel(match[2]) ?? match[2];
      return t('translation.jobFallbackSwitched', { from, to });
    }

    const toProvider = userFacingProviderLabel(entry.detail ?? '');
    if (toProvider) {
      return t('translation.jobFallbackSwitched', { from: '', to: toProvider });
    }
  }

  const last = timeline[timeline.length - 1];
  if (last.event === 'provider_fallback' && last.message) {
    return last.message;
  }

  return null;
}

export function formatAttemptProviderChain(
  attempts: JobAttemptDto[],
  t: (key: string) => string,
): { provider: string; state: string }[] {
  const rows: { provider: string; state: string }[] = [];
  for (const attempt of attempts) {
    const provider =
      userFacingProviderLabel(attempt.providerType) ??
      (attempt.providerType ? preferenceFromProviderId(attempt.providerType) ?? attempt.providerType : t('jobs.attemptUnknownProvider'));
    rows.push({
      provider,
      state: attempt.state,
    });
  }
  return rows;
}
