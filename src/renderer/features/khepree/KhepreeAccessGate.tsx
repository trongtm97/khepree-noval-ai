import { useState, type ReactNode } from 'react';
import type { KhepreeAccessState } from '@shared/schemas/khepree';
import type { KhepreeLoginPhase } from '@shared/constants/khepree';
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

function loginPhaseLabel(
  t: (key: string) => string,
  phase: KhepreeLoginPhase | null,
): string | null {
  switch (phase) {
    case 'opening_browser':
      return t('khepree.login.opening');
    case 'waiting_sign_in':
      return t('khepree.login.waiting');
    case 'exchanging':
      return t('khepree.login.exchanging');
    case 'success':
      return t('khepree.login.success');
    default:
      return null;
  }
}

function loginErrorMessage(
  t: (key: string) => string,
  code: string | undefined,
  fallback: string | null,
): string | null {
  switch (code) {
    case 'OAUTH_CANCELLED':
      return t('khepree.login.cancelled');
    case 'OAUTH_EXPIRED':
      return t('khepree.login.expired');
    case 'NETWORK_UNAVAILABLE':
      return t('khepree.login.networkError');
    default:
      return fallback;
  }
}

function LoginGate({
  busy,
  loginPhase,
  errorCode,
  error,
  onLogin,
}: {
  busy: boolean;
  loginPhase: KhepreeLoginPhase | null;
  errorCode: string | undefined;
  error: string | null;
  onLogin: () => Promise<void>;
}) {
  const t = useT();
  const phaseLabel = loginPhaseLabel(t, loginPhase);
  const errorMessage = loginErrorMessage(t, errorCode, error);
  const inProgress =
    loginPhase === 'opening_browser' ||
    loginPhase === 'waiting_sign_in' ||
    loginPhase === 'exchanging';

  return (
    <GateLayout title={t('khepree.login.title')} subtitle={t('khepree.login.subtitle')}>
      {phaseLabel ? <p className="setup-wizard__hint">{phaseLabel}</p> : null}
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      <Button
        type="button"
        variant="primary"
        disabled={busy || inProgress}
        onClick={() => void onLogin()}
      >
        {inProgress ? phaseLabel ?? t('khepree.login.opening') : t('khepree.login.action')}
      </Button>
      {!inProgress ? (
        <p className="setup-wizard__hint">{t('khepree.login.hint')}</p>
      ) : null}
    </GateLayout>
  );
}

function ValidatingGate() {
  const t = useT();
  return (
    <GateLayout title={t('khepree.validating.title')} subtitle={t('khepree.validating.subtitle')}>
      <p className="setup-wizard__hint">{t('khepree.validating.body')}</p>
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
    case 'validating':
      return <ValidatingGate />;
    case 'login':
      return (
        <LoginGate
          busy={busy}
          loginPhase={state.loginPhase}
          errorCode={state.error?.code}
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
