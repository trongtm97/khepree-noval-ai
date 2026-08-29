import { useCallback, useEffect, useState } from 'react';
import type { AiBrowserProbeKind } from '@shared/schemas/diagnostics';
import { useT } from '../../i18n';
import { Button, Select } from '../ui';
import { SettingsDisclosure } from './SettingsDisclosure';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

interface AccountOption { id: string; email: string | null; label: string }
interface ProjectOption { id: string; title: string }

const FULL_PROBE_SEQUENCE: AiBrowserProbeKind[] = [
  'browser',
  'login',
  'composer',
  'send',
  'trialTranslate',
];

const DETAIL_PROBE_BUTTONS: { kind: AiBrowserProbeKind; labelKey: string }[] = [
  { kind: 'browser', labelKey: 'settings.aiDiagBrowser' },
  { kind: 'login', labelKey: 'settings.aiDiagLogin' },
  { kind: 'composer', labelKey: 'settings.aiDiagComposer' },
  { kind: 'send', labelKey: 'settings.aiDiagSend' },
  { kind: 'trialTranslate', labelKey: 'settings.aiDiagTrial' },
  { kind: 'notebook', labelKey: 'settings.aiDiagResearchNotebook' },
];

export function AiDiagnosticsSettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [accountId, setAccountId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [accRes, projRes] = await Promise.all([
      window.novelTrans.accounts.list(),
      window.novelTrans.projects.list(),
    ]);
    const accOpts = accRes.accounts.map(
      (a: { id: string; email?: string | null; displayName?: string | null }) => ({
        id: a.id,
        email: a.email ?? null,
        label: (a.email ?? a.displayName) ?? a.id.slice(0, 8),
      }),
    );
    setAccounts(accOpts);
    if (!accountId && accOpts[0]) setAccountId(accOpts[0].id);

    const projOpts = projRes.projects.map((p: { id: string; title: string }) => ({
      id: p.id,
      title: p.title || p.id.slice(0, 8),
    }));
    setProjects(projOpts);
    if (!projectId && projOpts[0]) setProjectId(projOpts[0].id);
  }, [accountId, projectId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setProbeError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const runProbe = async (kind: AiBrowserProbeKind) => {
    if (!accountId) {
      setProbeError(t('settings.aiDiagNeedAccount'));
      return null;
    }
    const result = await window.novelTrans.diagnostics.aiBrowserProbe({
      kind,
      accountId,
      projectId: projectId || undefined,
    });
    return result;
  };

  const formatProbeResult = (kind: AiBrowserProbeKind, result: Awaited<ReturnType<typeof runProbe>>) => {
    if (!result) return '';
    const stepLines = result.steps
      .map((s) => `${s.ok ? '✓' : '✗'} ${s.step}${s.message ? `: ${s.message}` : ''}`)
      .join('\n');
    const summary = result.ok
      ? `${kind}: ${t('settings.aiDiagOk')}`
      : `${kind}: ${t('settings.aiDiagFail')} @ ${result.failedStep ?? '?'}`;
    return [summary, stepLines].filter(Boolean).join('\n');
  };

  const runSingleProbe = (kind: AiBrowserProbeKind) => {
    setBusy(true);
    setProbeError(null);
    setLastResult(null);
    void runProbe(kind)
      .then((result) => {
        if (!result) return;
        showSaved(result.ok ? t('settings.aiDiagOk') : t('settings.aiDiagFail'));
        setLastResult(formatProbeResult(kind, result));
      })
      .catch((err: unknown) => {
        setProbeError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { setBusy(false); });
  };

  const runFullAiCheck = () => {
    if (!accountId) {
      setProbeError(t('settings.aiDiagNeedAccount'));
      return;
    }
    setBusy(true);
    setProbeError(null);
    setLastResult(null);
    void (async () => {
      const lines: string[] = [];
      for (const kind of FULL_PROBE_SEQUENCE) {
        const result = await runProbe(kind);
        if (!result) break;
        lines.push(formatProbeResult(kind, result));
        if (!result.ok) break;
      }
      setLastResult(lines.join('\n\n'));
      showSaved(t('settings.aiDiagFullDone'));
    })()
      .catch((err: unknown) => {
        setProbeError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { setBusy(false); });
  };

  const body = (
    <>
      {probeError ? <SettingsStatus tone="error">{probeError}</SettingsStatus> : null}

      <div className="form-row" style={{ gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <label>
          {t('settings.aiDiagAccount')}
          <Select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); }}
            disabled={busy}
          >
            {accounts.length === 0 ? (
              <option value="">{t('settings.aiDiagNoAccounts')}</option>
            ) : (
              accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))
            )}
          </Select>
        </label>
        <label>
          {t('settings.aiDiagProject')}
          <Select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); }}
            disabled={busy}
          >
            <option value="">{t('settings.aiDiagOptionalProject')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="btn-row" style={{ marginTop: '0.75rem' }}>
        <Button
          variant="primary"
          disabled={busy || !accountId}
          onClick={() => { runFullAiCheck(); }}
        >
          {t('settings.aiDiagRunFull')}
        </Button>
      </div>

      <SettingsDisclosure title={t('settings.aiDetails')} defaultOpen={false}>
        <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {DETAIL_PROBE_BUTTONS.map((btn) => (
            <Button
              key={btn.kind}
              variant="secondary"
              disabled={busy || !accountId}
              onClick={() => { runSingleProbe(btn.kind); }}
            >
              {t(btn.labelKey)}
            </Button>
          ))}
        </div>
      </SettingsDisclosure>

      {lastResult ? (
        <pre
          className="muted"
          style={{
            marginTop: '0.75rem',
            whiteSpace: 'pre-wrap',
            fontSize: '0.85rem',
            maxHeight: '16rem',
            overflow: 'auto',
          }}
        >
          {lastResult}
        </pre>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div>
        <h3 className="settings-section__title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>
          {t('settings.aiBrowserDiagnosticsTitle')}
        </h3>
        <p className="muted settings-section__desc">{t('settings.aiDiagnosticsBody')}</p>
        {body}
      </div>
    );
  }

  return (
    <SettingsSection
      title={t('settings.aiDiagnosticsTitle')}
      description={t('settings.aiDiagnosticsBody')}
    >
      {body}
    </SettingsSection>
  );
}
