import { useEffect, useState } from 'react';
import { Dialog, Input } from '../../components/ui';
import { useT } from '../../i18n';

export interface AddBrowserAiAccountDialogProps {
  open: boolean;
  providerLabel: string;
  busy: boolean;
  onConfirm: (displayName: string) => void;
  onCancel: () => void;
}

export function AddBrowserAiAccountDialog({
  open,
  providerLabel,
  busy,
  onConfirm,
  onCancel,
}: AddBrowserAiAccountDialogProps) {
  const t = useT();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (open) setDisplayName('');
  }, [open]);

  if (!open) return null;

  return (
    <Dialog
      open={open}
      title={t('accounts.addBrowserTitle', { provider: providerLabel })}
      confirmLabel={t('actions.confirm')}
      cancelLabel={t('actions.cancel')}
      busy={busy}
      onConfirm={() => {
        onConfirm(displayName.trim());
      }}
      onCancel={onCancel}
    >
      <label className="field-label">
        {t('accounts.addDisplayNameOptional')}
        <Input
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
          }}
          placeholder={providerLabel}
          autoFocus
        />
      </label>
      <p className="muted u-text-sm">{t('accounts.addDisplayNameHint')}</p>
    </Dialog>
  );
}
