import { useT } from '../../i18n';
import type { AccountUiState } from './account-ui-state';

const STATUS_ICON: Record<AccountUiState, string> = {
  ready: '●',
  running: '●',
  paused: '○',
  login: '⚠',
  limited: '⚠',
  attention: '⚠',
};

export interface AccountStatusProps {
  state: AccountUiState;
  projectTitle?: string | null;
  reason?: string | null;
}

export function AccountStatus({ state, projectTitle, reason }: AccountStatusProps) {
  const t = useT();

  const label =
    state === 'running' && projectTitle
      ? t('jobs.accountStatusRunning', { project: projectTitle })
      : t(`jobs.accountStatus.${state}`);

  return (
    <div className={`account-status account-status--${state}`} role="status">
      <span className="account-status-icon" aria-hidden>
        {STATUS_ICON[state]}
      </span>
      <span className="account-status-label">{reason ?? label}</span>
    </div>
  );
}
