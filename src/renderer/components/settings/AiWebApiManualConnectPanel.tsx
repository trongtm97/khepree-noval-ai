import { useCallback, useEffect, useState } from 'react';
import type { AiAccountDto } from '@shared/schemas/ai-provider';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { useT } from '../../i18n';
import { Button, Input } from '../ui';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

export function AiWebApiManualConnectPanel() {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const [accounts, setAccounts] = useState<AiAccountDto[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [psid, setPsid] = useState('');
  const [psidts, setPsidts] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const acc = await window.khepreeNovelAI.aiAccounts.list({
      providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
    });
    setAccounts(acc.accounts);
    if (!selectedAccountId && acc.accounts[0]) {
      setSelectedAccountId(acc.accounts[0].id);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setActionError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  return (
    <div className="u-stack">
      <SettingsStatus tone="warn">{t('settings.advancedWebApiManualWarning')}</SettingsStatus>
      <p className="muted">{t('settings.aiConnectBody')}</p>
      {actionError ? <SettingsStatus tone="error">{actionError}</SettingsStatus> : null}

      {accounts.length === 0 ? (
        <p className="muted">{t('settings.aiNoAccounts')}</p>
      ) : (
        <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label>
            {t('settings.aiManualConnectAccount')}
            <select
              value={selectedAccountId ?? ''}
              onChange={(event) => {
                setSelectedAccountId(event.target.value || null);
              }}
              disabled={busy}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.googleEmail ?? account.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Email
            <Input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              autoComplete="off"
            />
          </label>
          <label>
            __Secure-1PSID
            <Input
              type="password"
              value={psid}
              onChange={(event) => {
                setPsid(event.target.value);
              }}
              autoComplete="off"
              placeholder="••••••••"
            />
          </label>
          <label>
            __Secure-1PSIDTS
            <Input
              type="password"
              value={psidts}
              onChange={(event) => {
                setPsidts(event.target.value);
              }}
              autoComplete="off"
              placeholder="••••••••"
            />
          </label>
          <Button
            variant="secondary"
            disabled={busy || !selectedAccountId || !psid}
            onClick={() => {
              if (!selectedAccountId) return;
              setBusy(true);
              setActionError(null);
              void window.khepreeNovelAI.aiAccounts
                .pasteCookies({
                  accountId: selectedAccountId,
                  secure1psid: psid,
                  secure1psidts: psidts || undefined,
                  googleEmail: email || undefined,
                })
                .then((connectResult) => {
                  showSaved(connectResult.message ?? t('settings.aiConnected'));
                  setPsid('');
                  setPsidts('');
                  return refresh();
                })
                .catch((err: unknown) => {
                  setActionError(
                    err instanceof Error ? err.message : String(err),
                  );
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            {t('settings.aiConnect')}
          </Button>
        </div>
      )}
    </div>
  );
}
