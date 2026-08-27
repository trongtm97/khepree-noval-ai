import { useCallback, useEffect, useState } from 'react';
import type { AiBrowserProbeKind } from '@shared/schemas/diagnostics';
import { useT } from '../../i18n';
import { Button, Card, SectionHeader, Select } from '../ui';

interface AccountOption { id: string; email: string | null; label: string }
interface ProjectOption { id: string; title: string }

const PROBE_BUTTONS: { kind: AiBrowserProbeKind; labelKey: string }[] = [
  { kind: 'browser', labelKey: 'settings.aiDiagBrowser' },
  { kind: 'login', labelKey: 'settings.aiDiagLogin' },
  { kind: 'notebook', labelKey: 'settings.aiDiagNotebook' },
  { kind: 'composer', labelKey: 'settings.aiDiagComposer' },
  { kind: 'send', labelKey: 'settings.aiDiagSend' },
  { kind: 'trialTranslate', labelKey: 'settings.aiDiagTrial' },
];

export function AiDiagnosticsSettingsPanel({
  onMessage,
  onError,
}: {
  onMessage: (msg: string | null) => void;
  onError: (msg: string | null) => void;
}) {
  const t = useT();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [accountId, setAccountId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

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
      onError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh, onError]);

  const runProbe = (kind: AiBrowserProbeKind) => {
    if (!accountId) {
      onError(t('settings.aiDiagNeedAccount'));
      return;
    }
    setBusy(true);
    onError(null);
    onMessage(null);
    setLastResult(null);
    void window.novelTrans.diagnostics
      .aiBrowserProbe({
        kind,
        accountId,
        projectId: projectId || undefined,
      })
      .then((result) => {
        const stepLines = result.steps
          .map((s) => `${s.ok ? '✓' : '✗'} ${s.step}${s.message ? `: ${s.message}` : ''}`)
          .join('\n');
        const summary = result.ok
          ? `${t('settings.aiDiagOk')}: ${result.message}`
          : `${t('settings.aiDiagFail')} @ ${result.failedStep ?? '?'}: ${result.message}`;
        onMessage(summary);
        setLastResult(
          [
            summary,
            stepLines,
            result.lastOkStep ? `lastOk=${result.lastOkStep}` : null,
            result.errorCode ? `code=${result.errorCode}` : null,
            result.diagnosticsDir ? `dir=${result.diagnosticsDir}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      })
      .catch((err: unknown) => {
        onError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { setBusy(false); });
  };

  return (
    <Card as="section" style={{ marginTop: '1rem' }}>
      <SectionHeader title={t('settings.aiDiagnosticsTitle')} />
      <p className="muted">{t('settings.aiDiagnosticsBody')}</p>

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

      <div className="btn-row" style={{ marginTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        {PROBE_BUTTONS.map((btn) => (
          <Button
            key={btn.kind}
            variant="secondary"
            disabled={busy || !accountId}
            onClick={() => { runProbe(btn.kind); }}
          >
            {t(btn.labelKey)}
          </Button>
        ))}
      </div>

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
    </Card>
  );
}
