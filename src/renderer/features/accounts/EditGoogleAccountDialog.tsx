import { useEffect, useState } from 'react';
import type { GoogleAccountDto } from '@shared/schemas/account';
import {
  GOOGLE_ACCOUNT_PLANS,
  type GoogleAccountPlan,
} from '@shared/constants/google-account';
import { Dialog, Input, Select } from '../../components/ui';
import { useT } from '../../i18n';
import { planLabelKey } from './account-ui-state';

export interface EditGoogleAccountDialogProps {
  account: GoogleAccountDto | null;
  busy: boolean;
  onConfirm: (data: { label: string; plan: GoogleAccountPlan; notes: string }) => void;
  onCancel: () => void;
}

export function EditGoogleAccountDialog({
  account,
  busy,
  onConfirm,
  onCancel,
}: EditGoogleAccountDialogProps) {
  const t = useT();
  const [label, setLabel] = useState('');
  const [plan, setPlan] = useState<GoogleAccountPlan>('UNKNOWN');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!account) return;
    setLabel(account.label);
    setPlan(account.plan);
    setNotes(account.notes ?? '');
  }, [account]);

  return (
    <Dialog
      open={account !== null}
      title={t('accounts.editAccountTitle')}
      confirmLabel={t('actions.save')}
      cancelLabel={t('actions.cancel')}
      busy={busy}
      onConfirm={() => {
        const trimmed = label.trim();
        if (!trimmed) return;
        onConfirm({ label: trimmed, plan, notes: notes.trim() });
      }}
      onCancel={onCancel}
    >
      <div className="account-edit-form">
        <label className="field-label">
          {t('accounts.editDisplayName')}
          <Input
            value={label}
            onChange={(e) => { setLabel(e.target.value); }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const trimmed = label.trim();
                if (trimmed) onConfirm({ label: trimmed, plan, notes: notes.trim() });
              }
            }}
          />
        </label>
        {account?.email ? (
          <label className="field-label">
            {t('accounts.editEmailReadonly')}
            <Input value={account.email} readOnly disabled />
          </label>
        ) : null}
        <label className="field-label">
          {t('accounts.menuChangePlan')}
          <Select value={plan} onChange={(e) => { setPlan(e.target.value as GoogleAccountPlan); }}>
            {GOOGLE_ACCOUNT_PLANS.map((p) => (
              <option key={p} value={p}>
                {t(planLabelKey(p))}
              </option>
            ))}
          </Select>
        </label>
        <label className="field-label">
          {t('accounts.menuNotes')}
          <Input
            value={notes}
            onChange={(e) => { setNotes(e.target.value); }}
            placeholder={t('accounts.notesPlaceholder')}
          />
        </label>
      </div>
    </Dialog>
  );
}
