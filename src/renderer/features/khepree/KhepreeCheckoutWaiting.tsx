import { LoaderCircle } from 'lucide-react';
import type { KhepreeAccessState } from '@shared/schemas/khepree';
import { useT } from '../../i18n';
import { Button } from '../../components/ui';

export function KhepreeCheckoutWaiting({
  state,
  busy,
  onCheck,
  onCancel,
  onReopen,
}: {
  state: KhepreeAccessState;
  busy: boolean;
  onCheck: () => Promise<void>;
  onCancel: () => Promise<void>;
  onReopen: () => Promise<void>;
}) {
  const t = useT();
  const phase = state.checkoutPhase;
  if (phase !== 'waiting' && phase !== 'confirming' && phase !== 'timeout') {
    return null;
  }

  const title =
    phase === 'confirming'
      ? t('khepree.checkout.confirmingTitle')
      : t('khepree.checkout.waitingTitle');
  const body =
    phase === 'confirming'
      ? t('khepree.checkout.confirmingBody')
      : t('khepree.checkout.waitingBody');

  return (
    <div className="khepree-checkout-waiting">
      <div className="khepree-checkout-waiting__icon" aria-hidden="true">
        <LoaderCircle size={22} strokeWidth={1.75} className="loading-spinner" />
      </div>
      <h2>{title}</h2>
      <p className="setup-wizard__hint">{body}</p>
      {state.checkoutError ? <p className="form-error">{state.checkoutError.message}</p> : null}
      <div className="khepree-gate__actions">
        <Button type="button" variant="primary" disabled={busy} onClick={() => void onCheck()}>
          {t('khepree.checkout.checkAgain')}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void onCancel()}>
          {t('khepree.checkout.cancel')}
        </Button>
        {state.checkoutCanReopen ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void onReopen()}>
            {t('khepree.checkout.reopen')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
