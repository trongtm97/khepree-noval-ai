import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { AccountAvailabilitySummary } from '@shared/schemas/account-availability';
import type { GoogleAccountPlan } from '@shared/constants/google-account';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import {
  PageHeader,
  Button,
  EmptyState,
  Dialog,
  Skeleton,
  ErrorPanel,
  Input,
  Select,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { helpArticleForErrorCode } from '../features/help/content';
import { useNotificationStore } from '../stores/notification-store';
import { useUiShellStore } from '../stores/ui-shell-store';
import {
  AccountsSummary,
  AccountRow,
  AddGoogleAccountDialog,
  EditGoogleAccountDialog,
  AccountDetailsDrawer,
  resolveAccountUiState,
  sortAccounts,
  matchesAccountFilter,
  isBrowserSecurityError,
  type AccountFilter,
  type AddAccountStep,
} from '../features/accounts';

export function AccountsPage() {
  const t = useT();
  const navigate = useNavigate();
  const addToast = useNotificationStore((s) => s.add);
  const showAdvanced = useUiShellStore((s) => s.showAdvancedTools);

  const [accounts, setAccounts] = useState<GoogleAccountDto[]>([]);
  const [summary, setSummary] = useState<AccountAvailabilitySummary>({
    ready: 0,
    busy: 0,
    paused: 0,
    needsAttention: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [filter, setFilter] = useState<AccountFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [removeTarget, setRemoveTarget] = useState<GoogleAccountDto | null>(null);
  const [editTarget, setEditTarget] = useState<GoogleAccountDto | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<GoogleAccountDto | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddAccountStep>('create');
  const [addAccountId, setAddAccountId] = useState<string | null>(null);
  const [addEmailDraft, setAddEmailDraft] = useState('');

  const refresh = useCallback(async () => {
    const result = await window.novelTrans.accounts.list();
    setAccounts(result.accounts);
    setSummary(result.summary);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refresh, t]);

  const toast = (kind: 'SUCCESS' | 'INFO' | 'ERROR', title: string) => {
    addToast({ kind, title, description: '', toast: true });
  };

  const run = async (
    accountId: string | null,
    action: () => Promise<void>,
    options?: { clearCardError?: boolean },
  ) => {
    if (options?.clearCardError !== false && accountId) {
      setCardErrors((prev) => {
        const { [accountId]: _omit, ...rest } = prev;
        return rest;
      });
    }
    setBusyId(accountId ?? 'global');
    try {
      await action();
      await refresh();
    } catch (err: unknown) {
      const raw =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : err && typeof err === 'object' && 'message' in err
              ? String(err.message)
              : t('errors.UNKNOWN.title');
      const msg = raw || t('errors.UNKNOWN.title');
      if (accountId) {
        setCardErrors((prev) => ({ ...prev, [accountId]: msg }));
      } else {
        setLoadError(msg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const startAddAccount = () => {
    setAddOpen(true);
    setAddStep('create');
    setAddAccountId(null);
    setAddEmailDraft('');
    void run(null, async () => {
      const result = await window.novelTrans.accounts.add({});
      setAddAccountId(result.account.id);
      setAddStep('login');
      try {
        await window.novelTrans.accounts.completeLogin(result.account.id, {});
        setAddStep('verify');
        setAddOpen(false);
        toast('SUCCESS', t('accounts.toastAdded'));
      } catch {
        setAddStep('login');
      }
    });
  };

  const handleAddSignedIn = () => {
    if (!addAccountId) return;
    void run(addAccountId, async () => {
      setAddStep('verify');
      try {
        await window.novelTrans.accounts.completeLogin(addAccountId, {});
        setAddOpen(false);
        toast('SUCCESS', t('accounts.toastAdded'));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/email|detect/i.test(msg)) {
          setAddStep('email');
        } else {
          throw err;
        }
      }
    });
  };

  const handleAddCompleteWithEmail = () => {
    if (!addAccountId) return;
    const email = addEmailDraft.trim();
    if (!email) return;
    void run(addAccountId, async () => {
      await window.novelTrans.accounts.completeLogin(addAccountId, { email });
      setAddOpen(false);
      toast('SUCCESS', t('accounts.toastAdded'));
    });
  };

  const handleAddReopenBrowser = () => {
    if (!addAccountId) return;
    void run(addAccountId, async () => {
      await window.novelTrans.accounts.openBrowser(addAccountId, 'gemini');
    });
  };

  const confirmRemove = () => {
    if (!removeTarget) return;
    const account = removeTarget;
    if (!account.availability.canRemove) {
      setCardErrors((prev) => ({
        ...prev,
        [account.id]: t('accounts.deleteBlockedBusy'),
      }));
      setRemoveTarget(null);
      return;
    }
    setRemoveTarget(null);
    void run(account.id, async () => {
      await window.novelTrans.accounts.remove(account.id);
      toast('SUCCESS', t('accounts.toastDeleted'));
    });
  };

  const handleEditConfirm = (data: {
    label: string;
    plan: GoogleAccountPlan;
    notes: string;
  }) => {
    if (!editTarget) return;
    const account = editTarget;
    setEditTarget(null);
    void run(account.id, async () => {
      await window.novelTrans.accounts.rename(account.id, data.label);
      if (data.plan !== account.plan) {
        await window.novelTrans.accounts.setPlan(account.id, data.plan);
      }
      const prevNotes = account.notes ?? '';
      if (data.notes !== prevNotes) {
        await window.novelTrans.accounts.setNotes(account.id, data.notes || null);
      }
      toast('SUCCESS', t('accounts.toastUpdated'));
    });
  };

  const sortedAccounts = useMemo(() => sortAccounts(accounts), [accounts]);

  const filteredAccounts = useMemo(
    () =>
      sortedAccounts.filter((account) =>
        matchesAccountFilter(account, filter, searchQuery),
      ),
    [sortedAccounts, filter, searchQuery],
  );

  if (loading) {
    return (
      <div>
        <PageHeader title={t('accounts.title')} description={t('accounts.subtitle')} />
        <div className="account-list">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      </div>
    );
  }

  const errInfo = loadError ? friendlyError(loadError) : null;

  return (
    <div className="accounts-page">
      <PageHeader
        title={t('accounts.title')}
        description={t('accounts.subtitle')}
        actions={
          <>
            <HelpContextButton articleId="google-accounts" />
            <Button variant="primary" disabled={busyId !== null} onClick={startAddAccount}>
              {t('actions.addGoogleAccount')}
            </Button>
          </>
        }
      />

      {errInfo ? (
        <ErrorPanel
          title={errInfo.title}
          description={errInfo.description}
          technical={errInfo.technical}
          helpArticleId={helpArticleForErrorCode(errInfo.code)}
          actions={[{ label: t('actions.retry'), onClick: () => void refresh(), primary: true }]}
        />
      ) : null}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t('accounts.emptyTitle')}
          description={t('accounts.emptyDesc')}
          actionLabel={t('actions.addGoogleAccount')}
          onAction={startAddAccount}
        />
      ) : (
        <>
          <AccountsSummary counts={summary} />

          {accounts.length > 5 ? (
            <div className="accounts-toolbar btn-row">
              <Input
                type="search"
                placeholder={t('accounts.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); }}
                className="accounts-search-input"
              />
              <Select
                value={filter}
                onChange={(e) => { setFilter(e.target.value as AccountFilter); }}
                aria-label={t('accounts.filterLabel')}
              >
                <option value="all">{t('accounts.filterAll')}</option>
                <option value="ready">{t('accounts.filterReady')}</option>
                <option value="busy">{t('accounts.filterBusy')}</option>
                <option value="attention">{t('accounts.filterAttention')}</option>
                <option value="paused">{t('accounts.filterPaused')}</option>
              </Select>
            </div>
          ) : null}

          <div className="account-list">
            {filteredAccounts.map((account) => {
              const state = resolveAccountUiState(account);
              const busy = busyId === account.id || busyId === 'global';

              return (
                <AccountRow
                  key={account.id}
                  account={account}
                  busy={busy}
                  showNotebook={showAdvanced}
                  cardError={cardErrors[account.id] ?? null}
                  onOpenGemini={() => {
                    void run(account.id, async () => {
                      await window.novelTrans.accounts.openBrowser(account.id, 'gemini');
                    });
                  }}
                  onCheck={() => {
                    void run(account.id, async () => {
                      const result = await window.novelTrans.accounts.testSession(account.id);
                      if (result.reason === 'BROWSER_NOT_SECURE') {
                        setCardErrors((prev) => ({
                          ...prev,
                          [account.id]: t('accounts.browserNotSecureFriendly'),
                        }));
                        return;
                      }
                      toast(
                        result.usable ? 'SUCCESS' : 'ERROR',
                        result.usable
                          ? t('accounts.toastCheckOk')
                          : t('accounts.toastCheckFailed'),
                      );
                    }, { clearCardError: false });
                  }}
                  onLogin={() => {
                    void run(account.id, async () => {
                      await window.novelTrans.accounts.openBrowser(account.id, 'gemini');
                    });
                  }}
                  onHandle={() => {
                    if (state === 'login') {
                      void run(account.id, async () => {
                        await window.novelTrans.accounts.openBrowser(account.id, 'gemini');
                      });
                    } else {
                      void run(account.id, async () => {
                        const result = await window.novelTrans.accounts.testSession(account.id);
                        if (!result.usable) {
                          await window.novelTrans.accounts.openBrowser(account.id, 'gemini');
                        }
                      });
                    }
                  }}
                  onResume={() => {
                    void run(account.id, async () => {
                      await window.novelTrans.accounts.enable(account.id);
                      toast('SUCCESS', t('accounts.toastResumed'));
                    });
                  }}
                  onPause={() => {
                    void run(account.id, async () => {
                      await window.novelTrans.accounts.disable(account.id);
                      toast('SUCCESS', t('accounts.toastPaused'));
                    });
                  }}
                  onRename={() => { setEditTarget(account); }}
                  onChangePlan={(plan) => {
                    void run(account.id, async () => {
                      await window.novelTrans.accounts.setPlan(account.id, plan);
                      toast('SUCCESS', t('accounts.toastPlanChanged'));
                    });
                  }}
                  onEditNotes={() => { setEditTarget(account); }}
                  onOpenNotebook={() => {
                    void run(account.id, async () => {
                      await window.novelTrans.accounts.openBrowser(account.id, 'notebook');
                    });
                  }}
                  onDetails={() => { setDetailsTarget(account); }}
                  onDelete={() => { setRemoveTarget(account); }}
                  onReopenBrowser={() => {
                    void run(account.id, async () => {
                      try {
                        await window.novelTrans.accounts.openBrowser(account.id, 'gemini');
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        if (isBrowserSecurityError(msg)) {
                          setCardErrors((prev) => ({
                            ...prev,
                            [account.id]: msg,
                          }));
                          return;
                        }
                        throw err;
                      }
                    }, { clearCardError: false });
                  }}
                  onViewGuide={() => {
                    navigate('/help/google-accounts');
                  }}
                />
              );
            })}
          </div>

          {filteredAccounts.length === 0 && accounts.length > 0 ? (
            <p className="muted accounts-no-results">{t('accounts.noFilterResults')}</p>
          ) : null}
        </>
      )}

      <p className="muted accounts-security-note">{t('accounts.passwordNote')}</p>

      <Dialog
        open={removeTarget !== null}
        title={t('accounts.deleteConfirmTitle', {
          email: removeTarget?.email ?? removeTarget?.label ?? '',
        })}
        description={t('accounts.deleteConfirmBody')}
        confirmLabel={t('accounts.deleteAccount')}
        cancelLabel={t('actions.cancel')}
        danger
        busy={busyId !== null}
        onConfirm={confirmRemove}
        onCancel={() => { setRemoveTarget(null); }}
      />

      <EditGoogleAccountDialog
        account={editTarget}
        busy={busyId !== null}
        onConfirm={handleEditConfirm}
        onCancel={() => { setEditTarget(null); }}
      />

      <AccountDetailsDrawer
        account={detailsTarget}
        showAdvanced={showAdvanced}
        onClose={() => { setDetailsTarget(null); }}
        onCopyPath={(path) => {
          void navigator.clipboard.writeText(path);
          toast('SUCCESS', t('accounts.toastCopied'));
        }}
      />

      <AddGoogleAccountDialog
        open={addOpen}
        step={addStep}
        accountId={addAccountId}
        busy={busyId !== null}
        emailDraft={addEmailDraft}
        onEmailDraftChange={setAddEmailDraft}
        onSignedIn={handleAddSignedIn}
        onReopenBrowser={handleAddReopenBrowser}
        onCompleteWithEmail={handleAddCompleteWithEmail}
        onCancel={() => {
          setAddOpen(false);
          setAddStep('create');
          setAddAccountId(null);
        }}
      />
    </div>
  );
}
