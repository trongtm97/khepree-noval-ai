import { useCallback, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { GoogleAccountPlan } from '@shared/constants/google-account';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
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
  AddGoogleAccountDialog,
  EditGoogleAccountDialog,
  EditBrowserAiAccountDialog,
  AddAiAccountDialog,
  AddBrowserAiAccountDialog,
  UnifiedAccountCard,
  UnifiedAccountDetailsDrawer,
  useAiAccounts,
  type AddAccountStep,
  type AccountFilter,
  type AiAccountProviderKind,
  type AiAccountViewModel,
  type ProviderFilter,
  computeUnifiedSummary,
  matchesProviderFilter,
  matchesAccountSearch,
  matchesStatusFilter,
} from '../features/accounts';

function parseProviderParam(raw: string | null): ProviderFilter {
  if (raw === 'gemini' || raw === 'chatgpt' || raw === 'meta') return raw;
  return 'all';
}

export function AccountsPage() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const addToast = useNotificationStore((s) => s.add);
  const showAdvanced = useUiShellStore((s) => s.showAdvancedTools);

  const providerParam = parseProviderParam(searchParams.get('provider'));
  const { accounts, loading, error: loadError, refresh } = useAiAccounts(t('accounts.displayNameFallback'));

  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<AccountFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [removeTarget, setRemoveTarget] = useState<AiAccountViewModel | null>(null);
  const [editGoogleTarget, setEditGoogleTarget] = useState<GoogleAccountDto | null>(null);
  const [editBrowserTarget, setEditBrowserTarget] = useState<AiAccountViewModel | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<AiAccountViewModel | null>(null);

  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddAccountStep>('create');
  const [addAccountId, setAddAccountId] = useState<string | null>(null);
  const [addEmailDraft, setAddEmailDraft] = useState('');
  const [addLabelDraft, setAddLabelDraft] = useState('');

  const [browserAddKind, setBrowserAddKind] = useState<AiAccountProviderKind | null>(null);
  const [browserAddOpen, setBrowserAddOpen] = useState(false);
  const [browserVerifyOpen, setBrowserVerifyOpen] = useState(false);
  const [browserVerifyAccountId, setBrowserVerifyAccountId] = useState<string | null>(null);

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
      const msg = err instanceof Error ? err.message : String(err);
      if (accountId) {
        setCardErrors((prev) => ({ ...prev, [accountId]: msg }));
      } else {
        toast('ERROR', msg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const setProviderFilter = useCallback(
    (filter: ProviderFilter) => {
      if (filter === 'all') {
        searchParams.delete('provider');
      } else {
        searchParams.set('provider', filter);
      }
      setSearchParams(searchParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const summary = useMemo(() => computeUnifiedSummary(accounts), [accounts]);

  const filteredAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          matchesProviderFilter(account, providerParam) &&
          matchesStatusFilter(account, statusFilter) &&
          matchesAccountSearch(account, searchQuery),
      ),
    [accounts, providerParam, statusFilter, searchQuery],
  );

  const showProviderFilter = accounts.length > 0 || true;

  const startAddAccount = () => {
    setAddPickerOpen(true);
  };

  const handleProviderPick = (kind: AiAccountProviderKind) => {
    setAddPickerOpen(false);
    if (kind === 'gemini') {
      setAddOpen(true);
      setAddStep('create');
      setAddAccountId(null);
      setAddEmailDraft('');
      setAddLabelDraft('');
      return;
    }
    setBrowserAddKind(kind);
    setBrowserAddOpen(true);
  };

  const handleAddCreateConfirm = () => {
    void run(null, async () => {
      const result = await window.khepreeNovelAI.accounts.add({
        label: addLabelDraft.trim() || undefined,
      });
      setAddAccountId(result.account.id);
      setAddStep('login');
      try {
        await window.khepreeNovelAI.accounts.completeLogin(result.account.id, {});
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
      try {
        await window.khepreeNovelAI.accounts.completeLogin(addAccountId, {});
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
      await window.khepreeNovelAI.accounts.completeLogin(addAccountId, { email });
      setAddOpen(false);
      toast('SUCCESS', t('accounts.toastAdded'));
    });
  };

  const handleAddReopenBrowser = () => {
    if (!addAccountId) return;
    void run(addAccountId, async () => {
      await window.khepreeNovelAI.accounts.openBrowser(addAccountId, 'gemini');
    });
  };

  const handleBrowserAdd = (displayName: string) => {
    const providerId =
      browserAddKind === 'meta'
        ? AI_PROVIDER_IDS.PLAYWRIGHT_META_AI
        : AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT;
    void run(null, async () => {
      const created = await window.khepreeNovelAI.aiAccounts.create({
        providerId,
        displayName: displayName || undefined,
      });
      setBrowserAddOpen(false);
      setBrowserVerifyAccountId(created.account.id);
      setBrowserVerifyOpen(true);
      const login = await window.khepreeNovelAI.aiAccounts.openBrowserLogin({
        accountId: created.account.id,
      });
      if (!login.ok) {
        throw new Error(login.message);
      }
    });
  };

  const handleBrowserVerify = () => {
    if (!browserVerifyAccountId) return;
    void run(browserVerifyAccountId, async () => {
      await window.khepreeNovelAI.aiAccounts.verifyBrowser({
        accountId: browserVerifyAccountId,
      });
      setBrowserVerifyOpen(false);
      setBrowserVerifyAccountId(null);
      toast('SUCCESS', t('accounts.toastCheckOk'));
    });
  };

  const confirmRemove = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    if (!target.canRemove) {
      setCardErrors((prev) => ({
        ...prev,
        [target.id]: t('accounts.deleteBlockedBusy'),
      }));
      setRemoveTarget(null);
      return;
    }
    setRemoveTarget(null);
    void run(target.id, async () => {
      if (target.source.kind === 'google') {
        await window.khepreeNovelAI.accounts.remove(target.id);
      } else {
        await window.khepreeNovelAI.aiAccounts.delete({ accountId: target.id });
      }
      toast('SUCCESS', t('accounts.toastDeleted'));
    });
  };

  const handleGoogleEditConfirm = (data: {
    label: string;
    plan: GoogleAccountPlan;
    notes: string;
  }) => {
    if (!editGoogleTarget) return;
    const account = editGoogleTarget;
    setEditGoogleTarget(null);
    void run(account.id, async () => {
      await window.khepreeNovelAI.accounts.rename(account.id, data.label);
      if (data.plan !== account.plan) {
        await window.khepreeNovelAI.accounts.setPlan(account.id, data.plan);
      }
      const prevNotes = account.notes ?? '';
      if (data.notes !== prevNotes) {
        await window.khepreeNovelAI.accounts.setNotes(account.id, data.notes || null);
      }
      toast('SUCCESS', t('accounts.toastUpdated'));
    });
  };

  const openSite = (vm: AiAccountViewModel) => {
    if (vm.source.kind === 'google') {
      void run(vm.id, async () => {
        await window.khepreeNovelAI.accounts.openBrowser(vm.id, 'gemini');
      });
    } else {
      void run(vm.id, async () => {
        const res = await window.khepreeNovelAI.aiAccounts.openBrowserLogin({ accountId: vm.id });
        if (!res.ok) throw new Error(res.message);
      });
    }
  };

  const checkAccount = (vm: AiAccountViewModel) => {
    if (vm.source.kind === 'google') {
      void run(vm.id, async () => {
        const result = await window.khepreeNovelAI.accounts.testSession(vm.id);
        if (result.reason === 'BROWSER_NOT_SECURE') {
          setCardErrors((prev) => ({
            ...prev,
            [vm.id]: t('accounts.browserNotSecureFriendly'),
          }));
          return;
        }
        toast(
          result.usable ? 'SUCCESS' : 'ERROR',
          result.usable ? t('accounts.toastCheckOk') : t('accounts.toastCheckFailed'),
        );
      }, { clearCardError: false });
    } else {
      void run(vm.id, async () => {
        await window.khepreeNovelAI.aiAccounts.verifyBrowser({ accountId: vm.id });
        toast('SUCCESS', t('accounts.toastCheckOk'));
      });
    }
  };

  const pauseAccount = (vm: AiAccountViewModel) => {
    void run(vm.id, async () => {
      if (vm.source.kind === 'google') {
        await window.khepreeNovelAI.accounts.disable(vm.id);
      } else {
        await window.khepreeNovelAI.aiAccounts.disable({ accountId: vm.id });
      }
      toast('SUCCESS', t('accounts.toastPaused'));
    });
  };

  const resumeAccount = (vm: AiAccountViewModel) => {
    void run(vm.id, async () => {
      if (vm.source.kind === 'google') {
        await window.khepreeNovelAI.accounts.enable(vm.id);
      } else {
        await window.khepreeNovelAI.aiAccounts.verifyBrowser({ accountId: vm.id });
      }
      toast('SUCCESS', t('accounts.toastResumed'));
    });
  };

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
            <Button variant="primary" disabled={busyId !== null} onClick={startAddAccount}>
              {t('accounts.addAiAccount')}
            </Button>
            <HelpContextButton articleId="google-accounts" />
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
          title={t('accounts.emptyUnifiedTitle')}
          description={t('accounts.emptyUnifiedDesc')}
          actionLabel={t('accounts.addAiAccount')}
          onAction={startAddAccount}
        />
      ) : (
        <>
          <AccountsSummary counts={summary} />

          {showProviderFilter ? (
            <div className="accounts-provider-filter btn-row" role="tablist">
              {(
                [
                  ['all', 'accounts.filterAll'],
                  ['gemini', 'accounts.providerGemini'],
                  ['chatgpt', 'accounts.providerChatGpt'],
                  ['meta', 'accounts.providerMetaAi'],
                ] as const
              ).map(([value, labelKey]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={providerParam === value}
                  className={`btn btn-sm ${providerParam === value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setProviderFilter(value);
                  }}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          ) : null}

          {accounts.length > 5 ? (
            <div className="accounts-toolbar btn-row">
              <Input
                type="search"
                placeholder={t('accounts.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                }}
                className="accounts-search-input"
              />
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as AccountFilter);
                }}
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
            {filteredAccounts.map((account) => (
              <UnifiedAccountCard
                key={`${account.providerKind}-${account.id}`}
                account={account}
                busy={busyId === account.id || busyId === 'global'}
                cardError={cardErrors[account.id] ?? null}
                onOpenSite={() => {
                  openSite(account);
                }}
                onCheck={() => {
                  checkAccount(account);
                }}
                onLogin={() => {
                  openSite(account);
                }}
                onPause={() => {
                  pauseAccount(account);
                }}
                onResume={() => {
                  resumeAccount(account);
                }}
                onRename={() => {
                  if (account.source.kind === 'google') {
                    setEditGoogleTarget(account.source.account);
                  } else {
                    setEditBrowserTarget(account);
                  }
                }}
                onDetails={() => {
                  setDetailsTarget(account);
                }}
                onDelete={() => {
                  setRemoveTarget(account);
                }}
              />
            ))}
          </div>

          {filteredAccounts.length === 0 && accounts.length > 0 ? (
            <p className="muted accounts-no-results">{t('accounts.noFilterResults')}</p>
          ) : null}
        </>
      )}

      <p className="accounts-security-note">{t('accounts.passwordNote')}</p>

      <AddAiAccountDialog
        open={addPickerOpen}
        busy={busyId !== null}
        onSelect={handleProviderPick}
        onCancel={() => {
          setAddPickerOpen(false);
        }}
      />

      <AddGoogleAccountDialog
        open={addOpen}
        step={addStep}
        accountId={addAccountId}
        busy={busyId !== null}
        labelDraft={addLabelDraft}
        onLabelDraftChange={setAddLabelDraft}
        emailDraft={addEmailDraft}
        onEmailDraftChange={setAddEmailDraft}
        onCreateConfirm={handleAddCreateConfirm}
        onSignedIn={handleAddSignedIn}
        onReopenBrowser={handleAddReopenBrowser}
        onCompleteWithEmail={handleAddCompleteWithEmail}
        onCancel={() => {
          setAddOpen(false);
          setAddStep('create');
          setAddAccountId(null);
        }}
      />

      <AddBrowserAiAccountDialog
        open={browserAddOpen}
        providerLabel={
          browserAddKind === 'meta'
            ? t('accounts.providerMetaAi')
            : t('accounts.providerChatGpt')
        }
        busy={busyId !== null}
        onConfirm={handleBrowserAdd}
        onCancel={() => {
          setBrowserAddOpen(false);
        }}
      />

      <Dialog
        open={browserVerifyOpen}
        title={t('accounts.verifyLoginTitle')}
        description={t('accounts.verifyLoginHint')}
        confirmLabel={t('accounts.signedInButton')}
        cancelLabel={t('actions.cancel')}
        busy={busyId !== null}
        onConfirm={handleBrowserVerify}
        onCancel={() => {
          setBrowserVerifyOpen(false);
        }}
      />

      <Dialog
        open={removeTarget !== null}
        title={t('accounts.deleteConfirmTitle', {
          email: removeTarget?.displayName ?? '',
        })}
        description={t('accounts.deleteConfirmBody')}
        confirmLabel={t('accounts.deleteAccount')}
        cancelLabel={t('actions.cancel')}
        danger
        busy={busyId !== null}
        onConfirm={confirmRemove}
        onCancel={() => {
          setRemoveTarget(null);
        }}
      />

      <EditGoogleAccountDialog
        account={editGoogleTarget}
        busy={busyId !== null}
        onConfirm={handleGoogleEditConfirm}
        onCancel={() => {
          setEditGoogleTarget(null);
        }}
      />

      <EditBrowserAiAccountDialog
        account={editBrowserTarget?.source.kind === 'ai' ? editBrowserTarget.source.account : null}
        busy={busyId !== null}
        onConfirm={(displayName) => {
          const target = editBrowserTarget;
          if (!target || target.source.kind !== 'ai') return;
          setEditBrowserTarget(null);
          void run(target.id, async () => {
            await window.khepreeNovelAI.aiAccounts.updateDisplayName({
              accountId: target.id,
              displayName,
            });
            toast('SUCCESS', t('accounts.toastUpdated'));
          });
        }}
        onCancel={() => {
          setEditBrowserTarget(null);
        }}
      />

      <UnifiedAccountDetailsDrawer
        account={detailsTarget}
        showAdvanced={showAdvanced}
        onClose={() => {
          setDetailsTarget(null);
        }}
        onCopyPath={(path) => {
          void navigator.clipboard.writeText(path);
          toast('SUCCESS', t('accounts.toastCopied'));
        }}
      />
    </div>
  );
}
