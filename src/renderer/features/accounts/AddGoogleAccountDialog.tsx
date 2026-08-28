import { useEffect, useState } from 'react';
import { Dialog, Button, Input } from '../../components/ui';
import { useT } from '../../i18n';

export type AddAccountStep = 'create' | 'login' | 'verify' | 'done' | 'email';

export interface AddGoogleAccountDialogProps {
  open: boolean;
  step: AddAccountStep;
  accountId: string | null;
  busy: boolean;
  emailDraft: string;
  onEmailDraftChange: (value: string) => void;
  onSignedIn: () => void;
  onReopenBrowser: () => void;
  onCompleteWithEmail: () => void;
  onCancel: () => void;
}

export function AddGoogleAccountDialog({
  open,
  step,
  busy,
  emailDraft,
  onEmailDraftChange,
  onSignedIn,
  onReopenBrowser,
  onCompleteWithEmail,
  onCancel,
}: AddGoogleAccountDialogProps) {
  const t = useT();
  const [showEmail, setShowEmail] = useState(false);

  useEffect(() => {
    if (step === 'email') setShowEmail(true);
    if (step === 'create' || step === 'login') setShowEmail(false);
  }, [step]);

  const stepDone = (s: AddAccountStep) => {
    const order: AddAccountStep[] = ['create', 'login', 'verify', 'done'];
    const current = step === 'email' ? 'verify' : step;
    return order.indexOf(s) < order.indexOf(current === 'done' ? 'done' : current);
  };

  const stepActive = (s: AddAccountStep) => {
    if (s === 'create') return step === 'create';
    if (s === 'login') return step === 'login' || step === 'email';
    if (s === 'verify') return step === 'verify' || step === 'email';
    return false;
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      title={t('accounts.addProgressTitle')}
      confirmLabel={showEmail ? t('actions.confirm') : t('accounts.signedInButton')}
      cancelLabel={t('actions.cancel')}
      busy={busy}
      onConfirm={showEmail ? onCompleteWithEmail : onSignedIn}
      onCancel={onCancel}
    >
      <ol className="account-add-steps">
        <li className={stepDone('create') ? 'done' : stepActive('create') ? 'active' : ''}>
          {stepDone('create') ? '✓' : stepActive('create') ? '●' : '○'}{' '}
          {t('accounts.addStepCreate')}
        </li>
        <li className={stepDone('login') ? 'done' : stepActive('login') ? 'active' : ''}>
          {stepDone('login') ? '✓' : stepActive('login') ? '●' : '○'}{' '}
          {t('accounts.addStepLogin')}
        </li>
        <li className={stepDone('verify') ? 'done' : stepActive('verify') ? 'active' : ''}>
          {stepDone('verify') ? '✓' : stepActive('verify') ? '●' : '○'}{' '}
          {t('accounts.addStepVerify')}
        </li>
      </ol>

      {step === 'login' ? (
        <p className="muted account-add-hint">{t('accounts.addLoginHint')}</p>
      ) : null}

      {showEmail ? (
        <div className="account-add-email-fallback">
          <p className="muted">{t('accounts.emailFallbackMessage')}</p>
          <Input
            type="email"
            placeholder={t('accounts.emailPlaceholder')}
            value={emailDraft}
            onChange={(e) => { onEmailDraftChange(e.target.value); }}
            autoFocus
          />
        </div>
      ) : null}

      {!showEmail && (step === 'login' || step === 'verify') ? (
        <div className="account-add-secondary btn-row" style={{ marginTop: '0.75rem' }}>
          <Button size="sm" variant="secondary" disabled={busy} onClick={onReopenBrowser}>
            {t('accounts.reopenBrowser')}
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}
