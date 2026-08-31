import { Dialog } from '../../components/ui';
import { useT } from '../../i18n';
import type { AiAccountProviderKind } from './ai-account-view-model';

export interface AddAiAccountDialogProps {
  open: boolean;
  busy: boolean;
  onSelect: (kind: AiAccountProviderKind) => void;
  onCancel: () => void;
}

export function AddAiAccountDialog({
  open,
  busy,
  onSelect,
  onCancel,
}: AddAiAccountDialogProps) {
  const t = useT();

  if (!open) return null;

  const options: { kind: AiAccountProviderKind; titleKey: string; descKey: string }[] = [
    { kind: 'gemini', titleKey: 'accounts.providerGemini', descKey: 'accounts.addGeminiDesc' },
    { kind: 'chatgpt', titleKey: 'accounts.providerChatGpt', descKey: 'accounts.addChatGptDesc' },
    { kind: 'meta', titleKey: 'accounts.providerMetaAi', descKey: 'accounts.addMetaDesc' },
  ];

  return (
    <Dialog
      open={open}
      title={t('accounts.addChooseProviderTitle')}
      confirmLabel={t('actions.close')}
      cancelLabel={t('actions.cancel')}
      busy={busy}
      onConfirm={onCancel}
      onCancel={onCancel}
    >
      <p className="muted account-add-hint">{t('accounts.addChooseProviderHint')}</p>
      <div className="accounts-provider-picker">
        {options.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            className="accounts-provider-picker-item"
            disabled={busy}
            onClick={() => {
              onSelect(opt.kind);
            }}
          >
            <strong>{t(opt.titleKey)}</strong>
            <span className="muted u-text-sm">{t(opt.descKey)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
