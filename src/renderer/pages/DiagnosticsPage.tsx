import { useCallback, useEffect, useState } from 'react';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { AutomationProviderId } from '@shared/constants/diagnostics';
import type {
  ConnectionTestResponse,
  GoogleSmokeRunResponse,
  NotebookGroundingSmokeRunResponse,
  HealthReport,
  LocatorSuggestion,
  ProviderStatus,
} from '@shared/schemas/diagnostics';
import { useT, t as i18nT } from '../i18n';

export function DiagnosticsPage() {
  const t = useT();
  const [accounts, setAccounts] = useState<GoogleAccountDto[]>([]);
  const [accountId, setAccountId] = useState('');
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResponse | null>(null);
  const [smokeNotebookUrl, setSmokeNotebookUrl] = useState('');
  const [smokeResult, setSmokeResult] = useState<GoogleSmokeRunResponse | null>(null);
  const [groundingResult, setGroundingResult] =
    useState<NotebookGroundingSmokeRunResponse | null>(null);
  const [overridePath, setOverridePath] = useState('');
  const [overrideCount, setOverrideCount] = useState(0);
  const [providerId, setProviderId] = useState<AutomationProviderId>('google-gemini');
  const [selectorKey, setSelectorKey] = useState('promptInput');
  const [repairSessionId, setRepairSessionId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<LocatorSuggestion | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [{ accounts: list }, status, overrides, report] = await Promise.all([
      window.khepreeNovelAI.accounts.list(),
      window.khepreeNovelAI.diagnostics.listProviders(),
      window.khepreeNovelAI.diagnostics.getOverrides(),
      window.khepreeNovelAI.diagnostics.healthReport(),
    ]);
    setAccounts(list);
    if (!accountId && list[0]) setAccountId(list[0].id);
    setProviders(status.providers);
    setOverridePath(overrides.filePath);
    setOverrideCount(
      Object.values(overrides.file.providers).reduce(
        (n, p) => n + Object.keys(p.selectors).length,
        0,
      ),
    );
    setHealth(report);
  }, [accountId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : i18nT('diagnostics.loadFailed'));
    });
  }, [refresh]);

  const runTest = async (
    kind: 'gemini' | 'notebook' | 'drive' | 'browserProfile',
  ) => {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.khepreeNovelAI.diagnostics.connectionTest({
        kind,
        accountId,
      });
      setTestResult(result);
      setMessage(
        t('diagnostics.testResult', {
          kind,
          ok: result.ok ? t('diagnostics.ok') : t('diagnostics.fail'),
          message: result.message,
        }),
      );
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runGoogleSmoke = async () => {
    if (!accountId || !smokeNotebookUrl.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setSmokeResult(null);
    try {
      const result = await window.khepreeNovelAI.diagnostics.googleSmoke({
        accountId,
        notebookUrl: smokeNotebookUrl.trim(),
        smokeProjectLabel: 'KHEPREE_NOVEL_AI_SMOKE',
        headless: false,
      });
      setSmokeResult(result);
      setMessage(
        t('diagnostics.googleSmokeResult', {
          overall: result.overall,
          path: result.reportPath,
        }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runNotebookGroundingSmoke = async () => {
    if (!accountId || !smokeNotebookUrl.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setGroundingResult(null);
    try {
      const result = await window.khepreeNovelAI.diagnostics.notebookGroundingSmoke({
        accountId,
        notebookUrl: smokeNotebookUrl.trim(),
        smokeProjectLabel: 'KHEPREE_NOVEL_AI_SMOKE',
        headless: false,
      });
      setGroundingResult(result);
      setMessage(
        t('diagnostics.notebookGroundingResult', {
          overall: result.overall,
          path: result.reportPath,
        }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const exportZip = async () => {
    setBusy(true);
    setError(null);
    try {
      const pick = await window.khepreeNovelAI.diagnostics.selectExportPath();
      if (pick.canceled || !pick.filePath) return;
      const result = await window.khepreeNovelAI.diagnostics.export({
        outputPath: pick.filePath,
      });
      setMessage(
        t('diagnostics.exportOk', {
          count: result.entryCount,
          path: result.filePath,
          excluded: result.excluded.join(', '),
        }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const loadOverrides = async () => {
    setBusy(true);
    setError(null);
    try {
      const pick = await window.khepreeNovelAI.diagnostics.selectOverridePath();
      if (pick.canceled || !pick.filePath) return;
      const result = await window.khepreeNovelAI.diagnostics.loadOverrides({
        filePath: pick.filePath,
      });
      if (!result.ok) {
        setError(result.errors.join('; ') || t('diagnostics.invalidOverride'));
        return;
      }
      setMessage(
        t('diagnostics.loadedOverrides', {
          count: result.overrideCount,
          path: result.filePath,
        }),
      );
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const reloadOverrides = async () => {
    setBusy(true);
    try {
      const result = await window.khepreeNovelAI.diagnostics.reloadOverrides();
      setMessage(
        result.ok
          ? t('diagnostics.reloadedOverrides', { count: result.overrideCount })
          : t('diagnostics.reloadErrors', { errors: result.errors.join('; ') }),
      );
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startRepair = async () => {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    setSuggestion(null);
    try {
      if (repairSessionId) {
        await window.khepreeNovelAI.diagnostics.repairCancel({ sessionId: repairSessionId });
      }
      const started = await window.khepreeNovelAI.diagnostics.repairStart({
        accountId,
        providerId,
        selectorKey,
      });
      setRepairSessionId(started.sessionId);
      setMessage(started.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const captureRepair = async () => {
    if (!repairSessionId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.khepreeNovelAI.diagnostics.repairCapture({
        sessionId: repairSessionId,
        timeoutMs: 90_000,
      });
      setSuggestion(result.suggestion);
      setMessage(
        result.suggestion.rejected
          ? t('diagnostics.rejected', { reason: result.suggestion.rejectReason ?? '' })
          : t('diagnostics.captured', { count: result.suggestion.suggestedStrategies.length }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const applyRepair = async () => {
    if (!repairSessionId) return;
    setBusy(true);
    try {
      const result = await window.khepreeNovelAI.diagnostics.repairApply({
        sessionId: repairSessionId,
        mode: 'prepend',
      });
      setMessage(
        t('diagnostics.applied', { key: result.selectorKey, path: result.filePath }),
      );
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelRepair = async () => {
    if (!repairSessionId) return;
    await window.khepreeNovelAI.diagnostics.repairCancel({ sessionId: repairSessionId });
    setRepairSessionId(null);
    setSuggestion(null);
    setMessage(t('diagnostics.repairCancelled'));
  };

  return (
    <div className="page">
      <header className="page-header">
        <h2>{t('diagnostics.title')}</h2>
        <p>{t('diagnostics.subtitle')}</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}

      <section className="panel">
        <h3>{t('diagnostics.account')}</h3>
        <select
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
          }}
          disabled={busy}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
              {a.email ? ` (${a.email})` : ''}
            </option>
          ))}
        </select>
      </section>

      <section className="panel">
        <h3>{t('diagnostics.providerStatus')}</h3>
        <table className="import-chapter-table">
          <thead>
            <tr>
              <th>{t('diagnostics.colProvider')}</th>
              <th>{t('diagnostics.colVersion')}</th>
              <th>{t('diagnostics.colSelectors')}</th>
              <th>{t('diagnostics.colLastSuccess')}</th>
              <th>{t('diagnostics.colOverrides')}</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.providerId}>
                <td>{p.label}</td>
                <td>{p.providerVersion}</td>
                <td>{p.selectorRegistryVersion}</td>
                <td>{p.lastSuccessfulRun ?? '—'}</td>
                <td>{p.overrideCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>{t('diagnostics.connectionTests')}</h3>
        <div className="btn-row">
          <button type="button" className="btn-secondary" disabled={busy || !accountId} onClick={() => void runTest('gemini')}>
            {t('diagnostics.testGemini')}
          </button>
          <button type="button" className="btn-secondary" disabled={busy || !accountId} onClick={() => void runTest('notebook')}>
            {t('diagnostics.testNotebook')}
          </button>
          <button type="button" className="btn-secondary" disabled={busy || !accountId} onClick={() => void runTest('browserProfile')}>
            {t('diagnostics.testBrowser')}
          </button>
        </div>
        {testResult ? (
          <pre className="code-block">{JSON.stringify(testResult, null, 2)}</pre>
        ) : null}
      </section>

      <section className="panel">
        <h3>{t('diagnostics.googleSmokeTitle')}</h3>
        <p className="muted">{t('diagnostics.googleSmokeBody')}</p>
        <label>
          {t('diagnostics.googleSmokeNotebookUrl')}
          <input
            type="url"
            value={smokeNotebookUrl}
            onChange={(e) => { setSmokeNotebookUrl(e.target.value); }}
            placeholder="https://notebooklm.google.com/notebook/…"
            style={{ width: '100%', marginTop: '0.25rem' }}
            disabled={busy}
          />
        </label>
        <div className="btn-row" style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !accountId || !smokeNotebookUrl.trim()}
            onClick={() => void runGoogleSmoke()}
          >
            {t('diagnostics.googleSmokeRun')}
          </button>
        </div>
        {smokeResult ? (
          <pre className="code-block">{JSON.stringify(smokeResult, null, 2)}</pre>
        ) : null}
      </section>

      <section className="panel">
        <h3>{t('diagnostics.notebookGroundingTitle')}</h3>
        <p className="muted">{t('diagnostics.notebookGroundingBody')}</p>
        <p className="muted">{t('diagnostics.notebookGroundingUrlHint')}</p>
        <div className="btn-row" style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !accountId || !smokeNotebookUrl.trim()}
            onClick={() => void runNotebookGroundingSmoke()}
          >
            {t('diagnostics.notebookGroundingRun')}
          </button>
        </div>
        {groundingResult ? (
          <pre className="code-block">{JSON.stringify(groundingResult, null, 2)}</pre>
        ) : null}
      </section>

      <section className="panel">
        <h3>{t('diagnostics.overrides')}</h3>
        <p>
          {t('diagnostics.overridesHint')}{' '}
          <code>{overridePath || '—'}</code> ({t('diagnostics.overrideKeys', { count: overrideCount })})
        </p>
        <div className="btn-row">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void loadOverrides()}>
            {t('diagnostics.loadOverride')}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void reloadOverrides()}>
            {t('diagnostics.reloadDisk')}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>{t('diagnostics.repair')}</h3>
        <div className="form-row">
          <label>
            {t('diagnostics.provider')}
            <select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value as AutomationProviderId);
              }}
              disabled={busy}
            >
              <option value="google-gemini">google-gemini</option>
              <option value="google-notebook">google-notebook</option>
            </select>
          </label>
          <label>
            {t('diagnostics.selectorKey')}
            <input
              value={selectorKey}
              onChange={(e) => {
                setSelectorKey(e.target.value);
              }}
              disabled={busy}
            />
          </label>
        </div>
        <div className="btn-row">
          <button type="button" className="btn-primary" disabled={busy || !accountId} onClick={() => void startRepair()}>
            {t('diagnostics.openBrowser')}
          </button>
          <button type="button" className="btn-secondary" disabled={busy || !repairSessionId} onClick={() => void captureRepair()}>
            {t('diagnostics.captureClick')}
          </button>
          <button type="button" className="btn-secondary" disabled={busy || !suggestion || suggestion.rejected} onClick={() => void applyRepair()}>
            {t('diagnostics.applySuggestion')}
          </button>
          <button type="button" className="btn-secondary" disabled={!repairSessionId} onClick={() => void cancelRepair()}>
            {t('actions.cancel')}
          </button>
        </div>
        {suggestion ? (
          <pre className="code-block">{JSON.stringify(suggestion, null, 2)}</pre>
        ) : null}
      </section>

      <section className="panel">
        <h3>{t('diagnostics.profileLeases')}</h3>
        {health?.profileLeases && health.profileLeases.length > 0 ? (
          <ul className="diagnostics-lease-list">
            {health.profileLeases.map((lease) => (
              <li key={`${lease.ownerId}-${lease.profilePath}`}>
                {t('diagnostics.profileLeaseRow', {
                  label: lease.label,
                  pid: String(lease.pid),
                  expiresAt: lease.expiresAt,
                })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('diagnostics.profileLeasesEmpty')}</p>
        )}
      </section>

      <section className="panel">
        <h3>{t('diagnostics.healthExport')}</h3>
        <div className="btn-row">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              void window.khepreeNovelAI.diagnostics.healthReport().then(setHealth);
            }}
          >
            {t('diagnostics.refreshHealth')}
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void exportZip()}>
            {t('diagnostics.exportZip')}
          </button>
        </div>
        {health ? (
          <pre className="code-block">{JSON.stringify(health, null, 2)}</pre>
        ) : null}
      </section>
    </div>
  );
}
