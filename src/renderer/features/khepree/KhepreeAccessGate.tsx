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

function ValidatingGate({ bodyKey }: { bodyKey?: string }) {
  const t = useT();
  return (
    <GateLayout title={t('khepree.validating.title')} subtitle={t('khepree.validating.subtitle')}>
      <p className="setup-wizard__hint">{t(bodyKey ?? 'khepree.validating.body')}</p>
    </GateLayout>
  );
}

function OfflineColdStartGate({
  error,
  onRetry,
  onSignOut,
}: {
  error: string | null;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const t = useT();
  return (
    <GateLayout
      title={t('khepree.offlineColdStart.title')}
      subtitle={t('khepree.offlineColdStart.subtitle')}
    >
      {error ? <p className="form-error">{error}</p> : null}
      <div className="khepree-gate__actions">
        <Button type="button" variant="primary" onClick={() => void onRetry()}>
          {t('khepree.offlineColdStart.retry')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void onSignOut()}>
          {t('khepree.offlineColdStart.signOut')}
        </Button>
      </div>
    </GateLayout>
  );
}

function EntitlementGate({
  titleKey,
  subtitleKey,
  onUpgrade,
  onRefresh,
}: {
  titleKey: string;
  subtitleKey: string;
  onUpgrade: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const t = useT();
  return (
    <GateLayout title={t(titleKey)} subtitle={t(subtitleKey)}>
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
  onSignOut,
}: {
  used: number | null;
  max: number | null;
  onManage: () => Promise<void>;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
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
        <Button type="button" variant="ghost" onClick={() => void onSignOut()}>
          {t('khepree.deviceLimit.signOut')}
        </Button>
      </div>
    </GateLayout>
  );
}

function DeviceAccessGate({
  titleKey,
  subtitleKey,
  onSignIn,
  onSignOut,
}: {
  titleKey: string;
  subtitleKey: string;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const t = useT();
  return (
    <GateLayout title={t(titleKey)} subtitle={t(subtitleKey)}>
      <div className="khepree-gate__actions">
        <Button type="button" variant="primary" onClick={() => void onSignIn()}>
          {t('khepree.revoked.signIn')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void onSignOut()}>
          {t('khepree.deviceLimit.signOut')}
        </Button>
      </div>
    </GateLayout>
  );
}

function ErrorGate({
  error,
  onRetry,
  onSignOut,
}: {
  error: string | null;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const t = useT();
  return (
    <GateLayout title={t('khepree.error.title')} subtitle={t('khepree.error.subtitle')}>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="khepree-gate__actions">
        <Button type="button" variant="primary" onClick={() => void onRetry()}>
          {t('khepree.error.retry')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void onSignOut()}>
          {t('khepree.error.signOut')}
        </Button>
      </div>
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

  if (state.status === 'ACTIVE' && state.canUseWorkspace) {
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

  switch (state.status) {
    case 'BOOTING':
    case 'VALIDATING_SESSION':
      return <ValidatingGate />;
    case 'DEVICE_ACTIVATING':
      return <ValidatingGate bodyKey="khepree.deviceActivating.body" />;
    case 'AUTH_REQUIRED':
      return (
        <LoginGate
          busy={busy}
          loginPhase={state.loginPhase}
          errorCode={state.error?.code}
          error={state.error?.message ?? null}
          onLogin={() => run(() => window.novelTrans.khepree.startLogin())}
        />
      );
    case 'AUTHENTICATING':
      return (
        <LoginGate
          busy={busy}
          loginPhase={state.loginPhase}
          errorCode={state.error?.code}
          error={state.error?.message ?? null}
          onLogin={() => run(() => window.novelTrans.khepree.startLogin())}
        />
      );
    case 'OFFLINE_COLD_START':
      return (
        <OfflineColdStartGate
          error={state.error?.message ?? null}
          onRetry={() => run(() => window.novelTrans.khepree.retryColdStart())}
          onSignOut={() => run(() => window.novelTrans.khepree.signOut())}
        />
      );
    case 'ENTITLEMENT_MISSING':
      return (
        <EntitlementGate
          titleKey="khepree.entitlement.title"
          subtitleKey="khepree.entitlement.subtitle"
          onUpgrade={() => run(() => window.novelTrans.khepree.startCheckout())}
          onRefresh={() => run(() => window.novelTrans.khepree.refreshEntitlement())}
        />
      );
    case 'ENTITLEMENT_EXPIRED':
      return (
        <EntitlementGate
          titleKey="khepree.entitlementExpired.title"
          subtitleKey="khepree.entitlementExpired.subtitle"
          onUpgrade={() => run(() => window.novelTrans.khepree.startCheckout())}
          onRefresh={() => run(() => window.novelTrans.khepree.refreshEntitlement())}
        />
      );
    case 'ENTITLEMENT_SUSPENDED':
      return (
        <EntitlementGate
          titleKey="khepree.entitlementSuspended.title"
          subtitleKey="khepree.entitlementSuspended.subtitle"
          onUpgrade={() => run(() => window.novelTrans.khepree.startCheckout())}
          onRefresh={() => run(() => window.novelTrans.khepree.refreshEntitlement())}
        />
      );
    case 'DEVICE_LIMIT_REACHED':
      return (
        <DeviceLimitGate
          used={state.devicesUsed}
          max={state.devicesMax}
          onManage={() => run(() => window.novelTrans.khepree.openExternal({ target: 'devices' }))}
          onRetry={() => run(() => window.novelTrans.khepree.retryActivation())}
          onSignOut={() => run(() => window.novelTrans.khepree.signOut())}
        />
      );
    case 'DEVICE_REMOVED':
      return (
        <DeviceAccessGate
          titleKey="khepree.deviceRemoved.title"
          subtitleKey="khepree.deviceRemoved.subtitle"
          onSignIn={() => run(() => window.novelTrans.khepree.startLogin())}
          onSignOut={() => run(() => window.novelTrans.khepree.signOut())}
        />
      );
    case 'DEVICE_BLOCKED':
      return (
        <DeviceAccessGate
          titleKey="khepree.deviceBlocked.title"
          subtitleKey="khepree.deviceBlocked.subtitle"
          onSignIn={() => run(() => window.novelTrans.khepree.startLogin())}
          onSignOut={() => run(() => window.novelTrans.khepree.signOut())}
        />
      );
    case 'ERROR':
      return (
        <ErrorGate
          error={state.error?.message ?? null}
          onRetry={() => run(() => window.novelTrans.khepree.retryColdStart())}
          onSignOut={() => run(() => window.novelTrans.khepree.signOut())}
        />
      );
    case 'LANGUAGE_REQUIRED':
    default:
      return (
        <ErrorGate
          error={state.error?.message ?? null}
          onRetry={() => run(() => window.novelTrans.khepree.retryColdStart())}
          onSignOut={() => run(() => window.novelTrans.khepree.signOut())}
        />
      );
  }
}
