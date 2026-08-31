import { useState, type ReactNode } from 'react';
import type { KhepreeAccessState } from '@shared/schemas/khepree';
import { useT } from '../../i18n';
import { AppBrand } from '../../components/shell/AppBrand';
import { Button } from '../../components/ui';

interface GateLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

function GateLayout({ title, subtitle, children }: GateLayoutProps) {
  return (
    <div className="setup-wizard khepree-gate">
      <div className="setup-wizard__panel">
        <AppBrand />
        <h1>{title}</h1>
        {subtitle ? <p className="setup-wizard__lead">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}

function LoginGate({
  busy,
  error,
  onLogin,
}: {
  busy: boolean;
  error: string | null;
  onLogin: () => Promise<void>;
}) {
  const t = useT();
  return (
    <GateLayout title={t('khepree.login.title')} subtitle={t('khepree.login.subtitle')}>
      {error ? <p className="form-error">{error}</p> : null}
      <Button type="button" variant="primary" disabled={busy} onClick={() => void onLogin()}>
        {busy ? t('khepree.login.opening') : t('khepree.login.action')}
      </Button>
      <p className="setup-wizard__hint">{t('khepree.login.hint')}</p>
    </GateLayout>
  );
}

function OfflineGate({ error, onRetry }: { error: string | null; onRetry: () => Promise<void> }) {
  const t = useT();
  return (
    <GateLayout title={t('khepree.offline.title')} subtitle={t('khepree.offline.subtitle')}>
      {error ? <p className="form-error">{error}</p> : null}
      <Button type="button" variant="primary" onClick={() => void onRetry()}>
        {t('khepree.offline.retry')}
      </Button>
    </GateLayout>
  );
}

function EntitlementGate({
  onUpgrade,
  onRefresh,
}: {
  onUpgrade: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const t = useT();
  return (
    <GateLayout title={t('khepree.entitlement.title')} subtitle={t('khepree.entitlement.subtitle')}>
      <div className="khepree-gate__actions">
        <Button type="button" variant="primary" onClick={() => void onUpgrade()}>
          {t('khepree.entitlement.upgrade')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void onRefresh()}>
          {t('khepree.entitlement.refresh')}
        </Button>
      </div>
    </GateLayout>
  );
}

function DeviceLimitGate({
  used,
  max,
  onManage,
  onRetry,
}: {
  used: number | null;
  max: number | null;
  onManage: () => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const t = useT();
  return (
    <GateLayout
      title={t('khepree.deviceLimit.title')}
      subtitle={t('khepree.deviceLimit.subtitle', {
        used: used ?? '?',
        max: max ?? '?',
      })}
    >
      <div className="khepree-gate__actions">
        <Button type="button" variant="primary" onClick={() => void onManage()}>
          {t('khepree.deviceLimit.manage')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void onRetry()}>
          {t('khepree.deviceLimit.retry')}
        </Button>
      </div>
    </GateLayout>
  );
}

function RevokedGate({ onSignIn }: { onSignIn: () => Promise<void> }) {
  const t = useT();
  return (
    <GateLayout title={t('khepree.revoked.title')} subtitle={t('khepree.revoked.subtitle')}>
      <Button type="button" variant="primary" onClick={() => void onSignIn()}>
        {t('khepree.revoked.signIn')}
      </Button>
    </GateLayout>
  );
}

export function KhepreeAccessGate({
  state,
  children,
}: {
  state: KhepreeAccessState;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  if (state.gate === 'workspace' && state.canUseWorkspace) {
    return <>{children}</>;
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  switch (state.gate) {
    case 'login':
      return (
        <LoginGate
          busy={busy}
          error={state.error?.message ?? null}
          onLogin={() => run(() => window.novelTrans.khepree.startLogin())}
        />
      );
    case 'offline':
      return (
        <OfflineGate
          error={state.error?.message ?? null}
          onRetry={() => run(() => window.novelTrans.khepree.retryColdStart())}
        />
      );
    case 'entitlement':
      return (
        <EntitlementGate
          onUpgrade={() => run(() => window.novelTrans.khepree.startCheckout())}
          onRefresh={() => run(() => window.novelTrans.khepree.refreshEntitlement())}
        />
      );
    case 'device_limit':
      return (
        <DeviceLimitGate
          used={state.devicesUsed}
          max={state.devicesMax}
          onManage={() => run(() => window.novelTrans.khepree.openExternal({ target: 'devices' }))}
          onRetry={() => run(() => window.novelTrans.khepree.retryActivation())}
        />
      );
    case 'revoked':
      return (
        <RevokedGate onSignIn={() => run(() => window.novelTrans.khepree.startLogin())} />
      );
    default:
      return (
        <OfflineGate
          error={state.error?.message ?? null}
          onRetry={() => run(() => window.novelTrans.khepree.retryColdStart())}
        />
      );
  }
}
