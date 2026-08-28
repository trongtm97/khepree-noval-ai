import { useNavigate } from 'react-router-dom';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { GoogleAccountPlan } from '@shared/constants/google-account';
import type { AccountActiveJob } from '@shared/schemas/account-availability';
import type { AccountUiLane } from '@shared/constants/account-availability';
import { Card, Badge } from '../../components/ui';
import { useT } from '../../i18n';
import {
  resolveAccountIdentity,
  resolveAccountUiState,
  planLabelKey,
} from './account-ui-state';
import { formatRelativeTime, formatExactTimestamp } from './format-relative-time';
import { AccountStatus } from './AccountStatus';
import { AccountPrimaryActions, AccountActionsMenu } from './AccountActionsMenu';

export interface AccountRowProps {
  account: GoogleAccountDto;
  busy: boolean;
  showNotebook: boolean;
  cardError?: string | null;
  onOpenGemini: () => void;
  onCheck: () => void;
  onLogin: () => void;
  onHandle: () => void;
  onResume: () => void;
  onPause: () => void;
  onRename: () => void;
  onChangePlan: (plan: GoogleAccountPlan) => void;
  onEditNotes: () => void;
  onOpenNotebook: () => void;
  onDetails: () => void;
  onDelete: () => void;
  onReopenBrowser: () => void;
  onViewGuide: () => void;
}

export function AccountRow({
  account,
  busy,
  showNotebook,
  cardError,
  onOpenGemini,
  onCheck,
  onLogin,
  onHandle,
  onResume,
  onPause,
  onRename,
  onChangePlan,
  onEditNotes,
  onOpenNotebook,
  onDetails,
  onDelete,
  onReopenBrowser,
  onViewGuide,
}: AccountRowProps) {
  const t = useT();
  const navigate = useNavigate();
  const state = resolveAccountUiState(account);
  const activeJob: AccountActiveJob | null | undefined = account.availability.activeJob;

  const { title, subtitle } = resolveAccountIdentity(account, t('accounts.displayNameFallback'));
  const rel = formatRelativeTime(account.lastUsedAt);
  const lastUsedText = rel ? t(rel.key, rel.params) : null;
  const lastUsedExact = formatExactTimestamp(account.lastUsedAt);

  const projectCount = account.assignedProjects.length;
  const projectNames = account.assignedProjects;

  const jobProjectTitle = activeJob?.projectName ?? null;
  const jobChapterRange =
    activeJob?.chapterFrom != null
      ? activeJob.chapterTo != null && activeJob.chapterTo !== activeJob.chapterFrom
        ? `${activeJob.chapterFrom}–${activeJob.chapterTo}`
        : String(activeJob.chapterFrom)
      : null;
  const jobProgress =
    activeJob?.paragraphsDone != null &&
    activeJob.paragraphsTotal != null &&
    activeJob.paragraphsTotal > 0
      ? `${activeJob.paragraphsDone} / ${activeJob.paragraphsTotal}`
      : null;

  const attentionReason = resolveAttentionReason(account, state, cardError, t);

  const showBrowserWarning =
    cardError != null &&
    /BROWSER_NOT_SECURE|không an toàn|may not be secure/i.test(cardError);

  return (
    <Card className={`account-row account-row--${state}`}>
      <div className="account-row-layout">
        <div className="account-row-left">
          {account.avatarUrl ? (
            <img className="account-avatar" src={account.avatarUrl} alt="" width={40} height={40} />
          ) : (
            <div className="account-avatar placeholder" aria-hidden>
              {title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="account-row-identity">
            <div className="account-row-title-row">
              <strong className="account-row-title">{title}</strong>
              <Badge tone="accent" className="account-plan-badge">
                {t(planLabelKey(account.plan))}
              </Badge>
            </div>
            {subtitle ? <span className="muted account-row-email">{subtitle}</span> : null}
          </div>
        </div>

        <div className="account-row-center">
          {state === 'running' && activeJob ? (
            <div className="account-current-work">
              <span className="account-current-work-label">{t('accounts.currentWorkLabel')}</span>
              <strong>{jobProjectTitle}</strong>
              {jobChapterRange ? (
                <span className="muted">
                  {t('accounts.currentWorkChapters', { range: jobChapterRange })}
                </span>
              ) : null}
              {jobProgress ? <span className="muted">{jobProgress}</span> : null}
            </div>
          ) : (
            <>
              {projectCount > 0 ? (
                <span
                  className="account-project-count"
                  title={projectNames.join('\n')}
                >
                  {t('accounts.projectCount', { count: String(projectCount) })}
                </span>
              ) : (
                <span className="muted account-project-count">
                  {t('accounts.noProjectsAssigned')}
                </span>
              )}
              {lastUsedText ? (
                <span
                  className="muted account-last-used"
                  title={lastUsedExact ?? undefined}
                >
                  {t('accounts.lastUsedLabel', { time: lastUsedText })}
                </span>
              ) : null}
            </>
          )}
          {account.profileLease && state === 'running' ? (
            <span className="account-lease-hint muted" role="status">
              {account.profileLease.label
                ? t('accounts.profileInUseDetail', { label: account.profileLease.label })
                : t('accounts.profileInUse')}
            </span>
          ) : null}
          {state === 'limited' ? (
            <span className="account-limited-hint muted">{t('accounts.limitedExplanation')}</span>
          ) : null}
        </div>

        <div className="account-row-right">
          <AccountStatus
            state={state}
            projectTitle={jobProjectTitle}
            reason={attentionReason}
          />
          <div className="account-row-actions">
            <AccountPrimaryActions
              state={state}
              busy={busy}
              onOpenGemini={onOpenGemini}
              onCheck={onCheck}
              onLogin={onLogin}
              onViewJob={() => {
                navigate(`/jobs?account=${account.id}`);
              }}
              onResume={onResume}
              onHandle={onHandle}
            />
            <AccountActionsMenu
              account={account}
              state={state}
              busy={busy}
              showNotebook={showNotebook}
              onRename={onRename}
              onChangePlan={onChangePlan}
              onEditNotes={onEditNotes}
              onOpenGemini={onOpenGemini}
              onOpenNotebook={onOpenNotebook}
              onPause={onPause}
              onResume={onResume}
              onDetails={onDetails}
              onDelete={onDelete}
            />
          </div>
        </div>
      </div>

      {showBrowserWarning ? (
        <div className="account-card-error" role="alert">
          <p>{t('accounts.browserNotSecureFriendly')}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-sm" onClick={onReopenBrowser}>
              {t('accounts.reopenBrowser')}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onViewGuide}>
              {t('accounts.viewGuide')}
            </button>
          </div>
          <details className="account-error-technical">
            <summary>{t('accounts.technicalDetails')}</summary>
            <p className="muted">{cardError}</p>
            <p className="muted">{t('accounts.browserNotSecureHint')}</p>
          </details>
        </div>
      ) : cardError && !showBrowserWarning ? (
        <div className="account-card-error" role="alert">
          <p>{cardError}</p>
        </div>
      ) : null}
    </Card>
  );
}

function resolveAttentionReason(
  account: GoogleAccountDto,
  state: AccountUiLane,
  cardError: string | null | undefined,
  t: (key: string) => string,
): string | null {
  if (cardError && state !== 'running') return cardError;
  if (state === 'login') return t('accounts.reasonLoginRequired');
  if (state === 'attention') {
    if (account.status === 'NEEDS_ATTENTION') return t('accounts.reasonNeedsAttention');
    return t('accounts.reasonInvalidSession');
  }
  if (state === 'limited') return t('accounts.limitedExplanation');
  return null;
}
