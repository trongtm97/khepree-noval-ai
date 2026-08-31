import { useNavigate } from 'react-router-dom';
import type { AccountActiveJob } from '@shared/schemas/account-availability';
import { Card, Badge } from '../../components/ui';
import { useT } from '../../i18n';
import { formatRelativeTime, formatExactTimestamp } from './format-relative-time';
import { AccountStatus } from './AccountStatus';
import type { AiAccountViewModel } from './ai-account-view-model';
import { openSiteLabelKey } from './ai-account-view-model';

export interface UnifiedAccountCardProps {
  account: AiAccountViewModel;
  busy: boolean;
  cardError?: string | null;
  onOpenSite: () => void;
  onCheck: () => void;
  onLogin: () => void;
  onPause: () => void;
  onResume: () => void;
  onRename: () => void;
  onDetails: () => void;
  onDelete: () => void;
}

export function UnifiedAccountCard({
  account,
  busy,
  cardError,
  onOpenSite,
  onCheck,
  onLogin,
  onPause,
  onResume,
  onRename,
  onDetails,
  onDelete,
}: UnifiedAccountCardProps) {
  const t = useT();
  const navigate = useNavigate();
  const state = account.statusLane;
  const activeJob = account.activeJob;

  const rel = formatRelativeTime(account.lastUsedAt);
  const lastUsedText = rel ? t(rel.key, rel.params) : null;
  const lastUsedExact = formatExactTimestamp(account.lastUsedAt);

  const jobLine = formatActiveJobLine(activeJob, t);

  const attentionReason =
    cardError ??
    (state === 'login'
      ? t('accounts.reasonLoginRequired')
      : state === 'attention' && account.lastError
        ? account.lastError
        : state === 'attention'
          ? t('accounts.reasonInvalidSession')
          : state === 'limited'
            ? t('accounts.limitedExplanation')
            : null);

  return (
    <Card className={`account-row account-row--${state}`}>
      <div className="account-row-layout">
        <div className="account-row-left">
          <div className="account-avatar placeholder account-provider-avatar" aria-hidden>
            {account.providerKind.slice(0, 1).toUpperCase()}
          </div>
          <div className="account-row-identity">
            <div className="account-row-title-row">
              <Badge tone="accent" className="account-provider-badge">
                {t(account.providerLabelKey)}
              </Badge>
              <strong className="account-row-title">{account.displayName}</strong>
              {account.planKey ? (
                <Badge tone="accent" className="account-plan-badge">
                  {t(account.planKey)}
                </Badge>
              ) : null}
            </div>
            {account.subtitle ? (
              <span className="muted account-row-email">{account.subtitle}</span>
            ) : account.providerKind !== 'gemini' ? (
              <span className="muted account-row-email">{t('accounts.personalAccount')}</span>
            ) : null}
          </div>
        </div>

        <div className="account-row-center">
          {state === 'running' && jobLine ? (
            <div className="account-current-work">
              <span className="account-current-work-label">{t('accounts.currentWorkLabel')}</span>
              <strong>{jobLine.title}</strong>
              {jobLine.chapters ? (
                <span className="muted">{jobLine.chapters}</span>
              ) : null}
            </div>
          ) : (
            <>
              {account.assignedProjectCount > 0 ? (
                <span className="account-project-count">
                  {t('accounts.projectCount', { count: String(account.assignedProjectCount) })}
                </span>
              ) : null}
              {lastUsedText ? (
                <span className="muted account-last-used" title={lastUsedExact ?? undefined}>
                  {t('accounts.lastUsedLabel', { time: lastUsedText })}
                </span>
              ) : null}
            </>
          )}
        </div>

        <div className="account-row-right">
          <AccountStatus
            state={state}
            projectTitle={activeJob?.projectName ?? null}
            reason={attentionReason}
          />
          <div className="account-row-actions">
            <div className="btn-row account-primary-actions">
              {state === 'login' || state === 'attention' ? (
                <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={onLogin}>
                  {t('accounts.actionLogin')}
                </button>
              ) : state === 'running' ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => {
                    navigate(`/jobs?account=${account.id}`);
                  }}
                >
                  {t('accounts.actionViewJob')}
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={onOpenSite}>
                    {t(openSiteLabelKey(account.providerKind))}
                  </button>
                  <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={onCheck}>
                    {t('accounts.browserVerify')}
                  </button>
                </>
              )}
            </div>
            <details className="account-actions-menu">
              <summary className="btn btn-sm btn-ghost" aria-label={t('accounts.moreActions')}>
                ⋯
              </summary>
              <div className="account-actions-dropdown">
                <button type="button" disabled={busy} onClick={onRename}>
                  {t('accounts.menuRename')}
                </button>
                {account.canPause && state !== 'paused' ? (
                  <button type="button" disabled={busy} onClick={onPause}>
                    {t('accounts.pauseAccount')}
                  </button>
                ) : null}
                {state === 'paused' ? (
                  <button type="button" disabled={busy} onClick={onResume}>
                    {t('accounts.resumeAccount')}
                  </button>
                ) : null}
                <hr />
                <button type="button" disabled={busy} onClick={onDetails}>
                  {t('accounts.menuDetails')}
                </button>
                <hr />
                <button type="button" className="danger" disabled={busy || !account.canDelete} onClick={onDelete}>
                  {t('accounts.deleteAccountConfirm')}
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>

      {cardError ? (
        <div className="account-card-error" role="alert">
          <p>{cardError}</p>
        </div>
      ) : null}
    </Card>
  );
}

function formatActiveJobLine(
  activeJob: AccountActiveJob | null,
  t: (key: string, params?: Record<string, string>) => string,
): { title: string; chapters: string | null } | null {
  if (!activeJob?.projectName) return null;
  const chapterRange =
    activeJob.chapterFrom != null
      ? activeJob.chapterTo != null && activeJob.chapterTo !== activeJob.chapterFrom
        ? `${activeJob.chapterFrom}–${activeJob.chapterTo}`
        : String(activeJob.chapterFrom)
      : null;
  return {
    title: activeJob.projectName,
    chapters: chapterRange
      ? t('accounts.currentWorkChapters', { range: chapterRange })
      : null,
  };
}
