import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { GoogleAccountPlan } from '@shared/constants/google-account';
import { GOOGLE_ACCOUNT_PLANS } from '@shared/constants/google-account';
import { Button, IconButton } from '../../components/ui';
import { DropdownMenu } from '../../components/overlay';
import { useT } from '../../i18n';
import { planLabelKey, type AccountUiState } from './account-ui-state';

export interface AccountActionsMenuProps {
  account: GoogleAccountDto;
  state: AccountUiState;
  busy: boolean;
  showNotebook: boolean;
  onRename: () => void;
  onChangePlan: (plan: GoogleAccountPlan) => void;
  onEditNotes: () => void;
  onOpenGemini: () => void;
  onOpenNotebook: () => void;
  onPause: () => void;
  onResume: () => void;
  onDetails: () => void;
  onDelete: () => void;
}

export function AccountActionsMenu({
  account,
  state,
  busy,
  showNotebook,
  onRename,
  onChangePlan,
  onEditNotes,
  onOpenGemini,
  onOpenNotebook,
  onPause,
  onResume,
  onDetails,
  onDelete,
}: AccountActionsMenuProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [planSubOpen, setPlanSubOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  const isRunning = state === 'running';
  const isPaused = state === 'paused' || !account.workerEnabled;

  return (
    <>
      <IconButton
        ref={menuRef}
        label={t('accounts.moreActions')}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        disabled={busy}
        onClick={() => {
          setMenuOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={18} aria-hidden />
      </IconButton>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) setPlanSubOpen(false);
        }}
        anchorRef={menuRef}
        className="translation-menu"
        placement="bottom-end"
        minWidth={240}
      >
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onRename(); }}>
          {t('accounts.menuRename')}
        </button>
        <button
          type="button"
          role="menuitem"
          aria-expanded={planSubOpen}
          onClick={() => { setPlanSubOpen((v) => !v); }}
        >
          {t('accounts.menuChangePlan')}
        </button>
        {planSubOpen ? (
          <div className="account-plan-submenu" role="group">
            {GOOGLE_ACCOUNT_PLANS.map((plan) => (
              <button
                key={plan}
                type="button"
                role="menuitem"
                className={account.plan === plan ? 'is-active' : ''}
                onClick={() => {
                  setMenuOpen(false);
                  setPlanSubOpen(false);
                  onChangePlan(plan);
                }}
              >
                {t(planLabelKey(plan))}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEditNotes(); }}>
          {t('accounts.menuNotes')}
        </button>
        <div className="menu-separator" role="separator" />
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenGemini(); }}>
          {t('actions.openGemini')}
        </button>
        {showNotebook ? (
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenNotebook(); }}>
            {t('accounts.openNotebookResearch')}
          </button>
        ) : null}
        <div className="menu-separator" role="separator" />
        {isPaused ? (
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onResume(); }}>
            {t('accounts.resumeAccount')}
          </button>
        ) : (
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onPause(); }}>
            {isRunning ? t('jobs.pauseWorkerAfterCurrent') : t('accounts.pauseAccount')}
          </button>
        )}
        <div className="menu-separator" role="separator" />
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDetails(); }}>
          {t('accounts.menuDetails')}
        </button>
        <button
          type="button"
          role="menuitem"
          className="menu-item-danger"
          onClick={() => { setMenuOpen(false); onDelete(); }}
        >
          {t('accounts.deleteAccountConfirm')}
        </button>
      </DropdownMenu>
    </>
  );
}

export interface AccountPrimaryActionsProps {
  state: AccountUiState;
  busy: boolean;
  onOpenGemini: () => void;
  onCheck: () => void;
  onLogin: () => void;
  onViewJob: () => void;
  onResume: () => void;
  onHandle: () => void;
}

export function AccountPrimaryActions({
  state,
  busy,
  onOpenGemini,
  onCheck,
  onLogin,
  onViewJob,
  onResume,
  onHandle,
}: AccountPrimaryActionsProps) {
  const t = useT();

  if (state === 'login') {
    return (
      <div className="account-primary-actions btn-row">
        <Button size="sm" variant="primary" disabled={busy} onClick={onLogin}>
          {t('accounts.actionLogin')}
        </Button>
        <Button size="sm" disabled={busy} title={t('accounts.checkConnectionTooltip')} onClick={onCheck}>
          {t('actions.check')}
        </Button>
      </div>
    );
  }

  if (state === 'running') {
    return (
      <div className="account-primary-actions btn-row">
        <Button size="sm" variant="primary" disabled={busy} onClick={onViewJob}>
          {t('accounts.actionViewJob')}
        </Button>
        <Button size="sm" disabled={busy} onClick={onOpenGemini}>
          {t('actions.openGemini')}
        </Button>
      </div>
    );
  }

  if (state === 'paused') {
    return (
      <div className="account-primary-actions btn-row">
        <Button size="sm" variant="primary" disabled={busy} onClick={onResume}>
          {t('accounts.resumeAccount')}
        </Button>
      </div>
    );
  }

  if (state === 'attention' || state === 'limited') {
    return (
      <div className="account-primary-actions btn-row">
        <Button size="sm" variant="primary" disabled={busy} onClick={onHandle}>
          {t('actions.handle')}
        </Button>
        <Button size="sm" disabled={busy} title={t('accounts.checkConnectionTooltip')} onClick={onCheck}>
          {t('actions.check')}
        </Button>
      </div>
    );
  }

  return (
    <div className="account-primary-actions btn-row">
      <Button size="sm" disabled={busy} onClick={onOpenGemini}>
        {t('actions.openGemini')}
      </Button>
      <Button size="sm" disabled={busy} title={t('accounts.checkConnectionTooltip')} onClick={onCheck}>
        {t('actions.check')}
      </Button>
    </div>
  );
}
