import type { JobAttemptDto } from '@shared/schemas/job';
import {
  classifyAiResponseText,
  geminiSoftErrorSnippet,
  isAiSoftErrorText,
} from '@shared/utils/provider-response-classifier';
import { formatTranslateChannel } from '@shared/utils/translate-channel';
import { t } from '../i18n';
import { friendlyError } from '../i18n/errors';
import { statusLabel } from '../i18n/status';

interface AttemptResultJson {
  phase?: string;
  parseStatus?: string;
  verdict?: string;
  missing?: string[];
  empty?: string[];
  reason?: string;
  mode?: string;
  next?: string;
  stop?: string;
  message?: string;
  providerType?: string;
  packMode?: string;
}

function parseResult(raw: string | null | undefined): AttemptResultJson | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AttemptResultJson;
  } catch {
    return null;
  }
}

/** Human-readable body under each activity-log attempt (VI/EN via t()). */
export function formatJobAttemptDetail(attempt: JobAttemptDto): string {
  const result = parseResult(attempt.result);
  const output = attempt.output?.trim() ?? '';

  const providerType = result?.providerType ?? attempt.providerType ?? null;

  if (result?.phase === 'repair_send') {
    if (isAiSoftErrorText(output, providerType)) {
      const classified = classifyAiResponseText(output, providerType);
      return t('logs.attemptRepairSendSoftError', {
        snippet: classified?.snippet ?? output.slice(0, 120),
      });
    }
    return t('logs.attemptRepairSendOk', { mode: result.mode ?? 'repair' });
  }

  if (result?.phase === 'repair_send_failed') {
    return t('logs.attemptRepairSendFailed', {
      detail: attempt.error ?? result.reason ?? '',
    });
  }

  if (result?.phase === 'provider_error') {
    const detail = result.message ?? attempt.error ?? output;
    if (isAiSoftErrorText(detail, providerType)) {
      const classified = classifyAiResponseText(detail, providerType);
      return t('logs.attemptProviderError', {
        snippet: classified?.snippet ?? detail.slice(0, 120),
      });
    }
    if (detail) {
      const friendly = friendlyError(detail);
      return friendly.code !== 'UNKNOWN'
        ? `${friendly.title}: ${detail}`
        : detail;
    }
    return t('logs.attemptProviderError', { snippet: '' });
  }

  if (isAiSoftErrorText(output, providerType)) {
    const classified = classifyAiResponseText(output, providerType);
    return t('logs.attemptProviderError', {
      snippet: classified?.snippet ?? output.slice(0, 120),
    });
  }

  if (result?.parseStatus === 'needs_repair' || result?.verdict === 'REPAIR_REQUIRED') {
    const missing = result.missing?.length ?? 0;
    const empty = result.empty?.length ?? 0;
    if (isAiSoftErrorText(output, providerType)) {
      const classified = classifyAiResponseText(output, providerType);
      return t('logs.attemptParseSoftError', {
        snippet: classified?.snippet ?? output.slice(0, 120),
        missing: String(missing),
      });
    }
    return t('logs.attemptParseFailed', {
      missing: String(missing),
      empty: String(empty),
      reason: result.reason ?? attempt.error ?? attempt.reason ?? 'MALFORMED_OUTPUT',
    });
  }

  if (result?.verdict === 'PASS' || result?.verdict === 'PASS_WITH_WARNINGS') {
    const channel = formatTranslateChannel({
      providerType: result.providerType,
      packMode: result.packMode,
    });
    const base = t('logs.attemptParseOk', { verdict: result.verdict });
    return channel ? `${base} · ${t('logs.attemptChannel', { channel })}` : base;
  }

  if (result?.parseStatus === 'recovered' || result?.parseStatus === 'ok') {
    return t('logs.attemptParseOk', {
      verdict: result.verdict ?? result.parseStatus,
    });
  }

  if (attempt.error) {
    const friendly = friendlyError(attempt.error);
    if (friendly.code !== 'UNKNOWN') return friendly.title;
    if (attempt.error.length < 120) return attempt.error;
    return friendly.title;
  }

  if (result && Object.keys(result).length > 0) {
    return JSON.stringify(result).slice(0, 160);
  }

  if (output) return geminiSoftErrorSnippet(output, 120);
  return '';
}

/** One-line headline: #n · status · reason */
export function formatJobAttemptHeadline(attempt: JobAttemptDto): string {
  const parts = [`#${attempt.attemptNumber}`, statusLabel(attempt.state)];
  if (attempt.reason) parts.push(attempt.reason);
  else if (attempt.error && !attempt.reason) {
    const code = attempt.error.split(':')[0]?.trim();
    if (code && /^[A-Z_]+$/.test(code)) parts.push(code);
  }
  return parts.join(' · ');
}
