import { useEffect, useState } from 'react';
import type { AiAccountDto } from '@shared/schemas/ai-provider';
import { Dialog, Input } from '../../components/ui';
import { useT } from '../../i18n';

export interface EditBrowserAiAccountDialogProps {
  account: AiAccountDto | null;
  busy: boolean;
  onConfirm: (displayName: string) => void;
  onCancel: () => void;
}

export function EditBrowserAiAccountDialog({
  account,
  busy,
  onConfirm,
  onCancel,
}: EditBrowserAiAccountDialogProps) {
  const t = useT();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (!account) return;
    setDisplayName(account.displayName ?? '');
  }, [account]);

  return (
    <Dialog
      open={account !== null}
      title={t('accounts.editAccountTitle')}
      confirmLabel={t('actions.save')}
      cancelLabel={t('actions.cancel')}
      busy={busy}
      onConfirm={() => {
        const trimmed = displayName.trim();
        if (!trimmed) return;
        onConfirm(trimmed);
      }}
      onCancel={onCancel}
    >
      <label className="field-label">
        {t('accounts.editDisplayName')}
        <Input
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
          }}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const trimmed = displayName.trim();
              if (trimmed) onConfirm(trimmed);
            }
          }}
        />
      </label>
    </Dialog>
  );
}
