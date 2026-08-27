import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { Button, Card, SectionHeader, Select } from '../ui';

type GlobalMaxMode = 'AUTO' | number;

interface SchedulerSettingsState {
  globalMaxMode: GlobalMaxMode;
  autoCap: number;
  perProjectMax: number;
  perProviderMax: number;
  maxConcurrent: number;
  parallelTranslationWaves: boolean;
  parallelWavesWarning: string;
}

const STREAM_OPTIONS = ['AUTO', '1', '2', '3', '4', '5', '6', '8'] as const;

export function SchedulerConcurrencyPanel(props: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const t = useT();
  const [state, setState] = useState<SchedulerSettingsState | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.novelTrans.jobs
      .schedulerStatus()
      .then((s) => {
        setState({
          globalMaxMode: s.globalMaxMode,
          autoCap: s.autoCap,
          perProjectMax: s.perProjectMax,
          perProviderMax: s.perProviderMax,
          maxConcurrent: s.maxConcurrent,
          parallelTranslationWaves: s.parallelTranslationWaves,
          parallelWavesWarning: s.parallelWavesWarning,
        });
      })
      .catch((err: unknown) => {
        props.onError(err instanceof Error ? err.message : String(err));
      });
    // Load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) return null;

  const streamValue =
    state.globalMaxMode === 'AUTO' ? 'AUTO' : String(state.globalMaxMode);

  const save = async (patch: {
    globalMaxWorkers?: GlobalMaxMode;
    perProjectMax?: number;
    perProviderMax?: number;
    parallelTranslationWaves?: boolean;
  }) => {
    setSaving(true);
    try {
      const next = await window.novelTrans.jobs.updateSchedulerSettings(patch);
      setState({
        globalMaxMode: next.globalMaxMode,
        autoCap: next.autoCap,
        perProjectMax: next.perProjectMax,
        perProviderMax: next.perProviderMax,
        maxConcurrent: next.maxConcurrent,
        parallelTranslationWaves: next.parallelTranslationWaves,
        parallelWavesWarning: next.parallelWavesWarning,
      });
      props.onMessage(t('settings.concurrencySaved'));
    } catch (err: unknown) {
      props.onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="section" style={{ marginTop: '1rem' }}>
      <SectionHeader title={t('settings.concurrencyTitle')} />
      <p className="muted">{t('settings.concurrencyBody')}</p>

      <label className="muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
        {t('settings.concurrencyStreams')}
      </label>
      <Select
        value={streamValue}
        aria-label={t('settings.concurrencyStreams')}
        disabled={saving}
        onChange={(event) => {
          const raw = event.target.value;
          const globalMaxWorkers: GlobalMaxMode =
            raw === 'AUTO' ? 'AUTO' : Number.parseInt(raw, 10);
          void save({ globalMaxWorkers });
        }}
      >
        {STREAM_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'AUTO'
              ? t('settings.concurrencyAuto').replace('{cap}', String(state.autoCap))
              : opt}
          </option>
        ))}
      </Select>
      <p className="muted" style={{ marginTop: '0.5rem' }}>
        {t('settings.concurrencyEffective').replace('{n}', String(state.maxConcurrent))}
      </p>

      <div className="btn-row" style={{ marginTop: '0.75rem' }}>
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            setShowAdvanced((v) => !v);
          }}
        >
          {t('settings.concurrencyAdvanced')}
        </Button>
      </div>

      {showAdvanced ? (
        <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
          <div>
            <label
              className="muted"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                marginBottom: '0.35rem',
              }}
            >
              <input
                type="checkbox"
                checked={state.parallelTranslationWaves}
                disabled={saving}
                aria-label={t('settings.parallelWavesTitle')}
                onChange={(event) => {
                  void save({ parallelTranslationWaves: event.target.checked });
                }}
              />
              <span>
                <strong>{t('settings.parallelWavesTitle')}</strong>
                <span className="muted" style={{ display: 'block', marginTop: '0.25rem' }}>
                  {t('settings.parallelWavesBody')}
                </span>
              </span>
            </label>
            {state.parallelTranslationWaves ? (
              <p className="muted" role="status" style={{ marginTop: '0.35rem' }}>
                {state.parallelWavesWarning || t('settings.parallelWavesWarning')}
              </p>
            ) : null}
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
              {t('settings.concurrencyPerProject')}
            </label>
            <Select
              value={String(state.perProjectMax)}
              disabled={saving || !state.parallelTranslationWaves}
              aria-label={t('settings.concurrencyPerProject')}
              onChange={(event) => {
                const n = Number.parseInt(event.target.value, 10);
                void save({
                  perProjectMax: n,
                });
              }}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
              {t('settings.concurrencyPerProvider')}
            </label>
            <Select
              value={String(state.perProviderMax)}
              disabled={saving}
              aria-label={t('settings.concurrencyPerProvider')}
              onChange={(event) => {
                void save({ perProviderMax: Number.parseInt(event.target.value, 10) });
              }}
            >
              {[1, 2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
