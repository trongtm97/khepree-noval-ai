import { useState } from 'react';
import type { UiLocaleCode } from '@shared/types/ui-locale';
import { AppBrand } from '../components/shell/AppBrand';
import { Button } from '../components/ui';
import { applyUiLanguageStatus } from '../i18n';

/**
 * First-run language chooser — bilingual static copy (locale not chosen yet).
 * Persists via app_meta (uiLanguage IPC), not localStorage.
 */
export function LanguageFirstRunPage({ onComplete }: { onComplete: () => void }) {
  const [selected, setSelected] = useState<UiLocaleCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueWith = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await window.novelTrans.uiLanguage.completeFirstRun({ preference: selected });
      applyUiLanguageStatus(status);
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-wizard language-first-run">
      <div className="setup-wizard__panel">
        <AppBrand />
        <h1>Choose your language</h1>
        <p className="setup-wizard__lead">Chọn ngôn ngữ hiển thị · Select display language</p>
        <div className="khepree-gate__actions language-first-run__options">
          <Button
            type="button"
            variant={selected === 'vi' ? 'primary' : 'secondary'}
            aria-pressed={selected === 'vi'}
            onClick={() => setSelected('vi')}
          >
            Tiếng Việt
          </Button>
          <Button
            type="button"
            variant={selected === 'en' ? 'primary' : 'secondary'}
            aria-pressed={selected === 'en'}
            onClick={() => setSelected('en')}
          >
            English
          </Button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="button" variant="primary" disabled={!selected || busy} onClick={() => void continueWith()}>
          {busy ? '…' : 'Continue / Tiếp tục'}
        </Button>
      </div>
    </div>
  );
}
