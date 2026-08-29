import { useCallback, useEffect, useState } from 'react';
import type { AiAccountDto } from '@shared/schemas/ai-provider';
import { useT } from '../../i18n';
import { statusLabel } from '../../i18n/status';
import { Badge, Button, Card, Dialog } from '../../components/ui';
import { AddBrowserAiAccountDialog } from './AddBrowserAiAccountDialog';
import { EditBrowserAiAccountDialog } from './EditBrowserAiAccountDialog';

export interface BrowserAiAccountSectionProps {
  providerId: string;
  providerLabel: string;
  sectionTitle: string;
  sectionDesc: string;
  onToast: (kind: 'SUCCESS' | 'ERROR', title: string) => void;
}

export function BrowserAiAccountSection({
  providerId,
  providerLabel,
  sectionTitle,
  sectionDesc,
  onToast,
}: BrowserAiAccountSectionProps) {
  const t = useT();
  const [accounts, setAccounts] = useState<AiAccountDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AiAccountDto | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AiAccountDto | null>(null);

  const refresh = useCallback(async () => {
    const res = await window.novelTrans.aiAccounts.list({ providerId });
    setAccounts(res.accounts);
  }, [providerId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const statusTone = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    if (status === 'READY') return 'success';
    if (status === 'LOGIN_REQUIRED') return 'warning';
    if (status === 'ERROR' || status === 'DISABLED') return 'error';
    return 'default';
  };

  const runAccountAction = async (
    accountId: string | null,
    action: () => Promise<void>,
  ) => {
    setBusyId(accountId ?? 'global');
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onToast('ERROR', msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = (displayName: string) => {
    void runAccountAction(null, async () => {
      await window.novelTrans.aiAccounts.create({
        providerId,
        displayName: displayName || undefined,
      });
      setAddOpen(false);
      onToast('SUCCESS', t('accounts.toastAdded'));
    });
  };

  const confirmRemove = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    void runAccountAction(target.id, async () => {
      await window.novelTrans.aiAccounts.delete({ accountId: target.id });
      onToast('SUCCESS', t('accounts.toastDeleted'));
    });
  };

  return (
    <section className="accounts-section">
      <header className="accounts-section-header">
        <div className="accounts-section-heading">
          <h2 className="accounts-section-title">{sectionTitle}</h2>
          <p className="accounts-section-desc">{sectionDesc}</p>
        </div>
        <Button
          variant="secondary"
          disabled={busyId !== null}
          onClick={() => {
            setAddOpen(true);
          }}
        >
          {t('accounts.browserAdd', { provider: providerLabel })}
        </Button>
      </header>

      <div className="accounts-section-body">
        {error ? <p className="settings-status settings-status--error">{error}</p> : null}

        {accounts.length === 0 ? (
          <p className="accounts-section-empty">
            {t('accounts.browserEmpty', { provider: providerLabel })}
          </p>
        ) : (
          <div className="accounts-browser-list">
            {accounts.map((account) => (
              <Card key={account.id} as="div" className="accounts-browser-card">
                <div className="accounts-browser-card-header">
                  <div>
                    <div className="accounts-browser-card-name">
                      {account.displayName ?? account.id.slice(0, 8)}
                    </div>
                    <div className="accounts-browser-card-provider">{providerLabel}</div>
                  </div>
                  <Badge tone={statusTone(account.status)}>
                    {statusLabel(account.status)}
                  </Badge>
                </div>
                <div className="accounts-browser-card-actions">
                  <Button
                    variant="secondary"
                    disabled={busyId === account.id}
                    onClick={() => {
                      void runAccountAction(account.id, async () => {
                        const res = await window.novelTrans.aiAccounts.openBrowserLogin({
                          accountId: account.id,
                        });
                        if (!res.ok) {
                          throw new Error(res.message);
                        }
                      });
                    }}
                  >
                    {t('accounts.browserLogin')}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === account.id}
                    onClick={() => {
                      void runAccountAction(account.id, async () => {
                        await window.novelTrans.aiAccounts.verifyBrowser({
                          accountId: account.id,
                        });
                        onToast('SUCCESS', t('accounts.toastCheckOk'));
                      });
                    }}
                  >
                    {t('accounts.browserVerify')}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === account.id}
                    onClick={() => {
                      setEditTarget(account);
                    }}
                  >
                    {t('accounts.browserRename')}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === account.id}
                    onClick={() => {
                      setRemoveTarget(account);
                    }}
                  >
                    {t('accounts.browserDelete')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddBrowserAiAccountDialog
        open={addOpen}
        providerLabel={providerLabel}
        busy={busyId !== null}
        onConfirm={handleAdd}
        onCancel={() => {
          setAddOpen(false);
        }}
      />

      <EditBrowserAiAccountDialog
        account={editTarget}
        busy={busyId !== null}
        onConfirm={(displayName) => {
          const target = editTarget;
          if (!target) return;
          setEditTarget(null);
          void runAccountAction(target.id, async () => {
            await window.novelTrans.aiAccounts.updateDisplayName({
              accountId: target.id,
              displayName,
            });
            onToast('SUCCESS', t('accounts.toastUpdated'));
          });
        }}
        onCancel={() => {
          setEditTarget(null);
        }}
      />

      <Dialog
        open={removeTarget !== null}
        title={t('accounts.browserDeleteConfirmTitle', {
          name: removeTarget?.displayName ?? providerLabel,
        })}
        description={`${t('accounts.browserDeleteConfirmBody')} ${t('accounts.closeLoginBeforeDelete')}`}
        confirmLabel={t('accounts.deleteAccount')}
        cancelLabel={t('actions.cancel')}
        danger
        busy={busyId !== null}
        onConfirm={confirmRemove}
        onCancel={() => {
          setRemoveTarget(null);
        }}
      />
    </section>
  );
}
