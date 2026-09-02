import { LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../../i18n';
import { useKhepreeAccessState } from '../useKhepreeAccessState';
import { Button, Card } from '../../../components/ui';
import { openKhepreeExternal } from '../khepree-external';
import { KhepreeInfoRow } from '../components/KhepreeInfoRow';
import {
  formatKhepreeAccessStatus,
  formatKhepreeAccountConnectionLabel,
  formatKhepreeDevicesCount,
  formatKhepreeEntitlement,
  formatKhepreeProductDisplayName,
  formatKhepreeRenewalLine,
  khepreeAccountConnectionTone,
  khepreeDisplayInitials,
  khepreeEntitlementBadgeVariant,
  maskKhepreeEmail,
} from '../khepree-display';

export function KhepreeAccountPage() {
  const t = useT();
  const navigate = useNavigate();
  const { state } = useKhepreeAccessState();
  const renewal = state ? formatKhepreeRenewalLine(t, state) : null;

  const devicesUsed = state?.devicesUsed ?? null;
  const devicesMax = state?.devicesMax ?? null;
  const devicesPct =
    devicesUsed != null && devicesMax != null && devicesMax > 0
      ? Math.min(100, Math.round((devicesUsed / devicesMax) * 100))
      : 0;
  const connectionTone = state ? khepreeAccountConnectionTone(state) : 'warning';

  return (
    <Card className="khepree-panel khepree-account">
      {!state?.signedIn ? (
        <div className="khepree-account__empty">
          <div className="khepree-account__empty-icon" aria-hidden="true">
            <User size={28} strokeWidth={1.75} />
          </div>
          <h2>{t('khepree.account.title')}</h2>
          <p>{t('khepree.account.notSignedIn')}</p>
          <Button type="button" variant="primary" onClick={() => void window.khepreeNovelAI.khepree.startLogin()}>
            {t('khepree.login.action')}
          </Button>
        </div>
      ) : (
        <>
          <header className="khepree-account__hero">
            <div className="khepree-account__hero-main">
              <div className="khepree-account__avatar" aria-hidden="true">
                {khepreeDisplayInitials(state.user?.displayName)}
              </div>
              <div className="khepree-account__identity">
                <h2>{state.user?.displayName ?? t('khepree.account.nameUnknown')}</h2>
                <p className="khepree-account__email">
                  {state.user?.email ? maskKhepreeEmail(state.user.email) : '—'}
                </p>
                <p
                  className={`khepree-account__status khepree-account__status--${connectionTone}`}
                >
                  <span className="khepree-account__status-dot" aria-hidden="true" />
                  {formatKhepreeAccountConnectionLabel(t, state)}
                </p>
              </div>
            </div>
            <span
              className={`nt-badge nt-badge--${khepreeEntitlementBadgeVariant(state.entitlement)} khepree-account__plan-badge`}
            >
              {formatKhepreeEntitlement(t, state.entitlement)}
            </span>
          </header>

          <div className="khepree-account__body">
            <div className="khepree-account__sections">
              <section className="khepree-account__section" aria-labelledby="khepree-account-subscription">
                <h3 id="khepree-account-subscription" className="khepree-eyebrow">
                  {t('khepree.account.sectionSubscription')}
                </h3>
                <dl className="khepree-info-rows">
                  <KhepreeInfoRow
                    label={t('khepree.account.product')}
                    value={formatKhepreeProductDisplayName(t)}
                  />
                  <KhepreeInfoRow
                    label={t('khepree.account.currentPlan')}
                    value={state.plan?.planName ?? t('khepree.menu.noPlan')}
                  />
                  <KhepreeInfoRow
                    label={t('khepree.account.entitlement')}
                    value={formatKhepreeEntitlement(t, state.entitlement)}
                  />
                </dl>
              </section>

              <section className="khepree-account__section" aria-labelledby="khepree-account-access">
                <h3 id="khepree-account-access" className="khepree-eyebrow">
                  {t('khepree.account.sectionAccess')}
                </h3>
                <dl className="khepree-info-rows">
                  <KhepreeInfoRow
                    label={t('khepree.account.access')}
                    value={formatKhepreeAccessStatus(t, state.status)}
                  />
                  <KhepreeInfoRow
                    label={t('khepree.account.devices')}
                    stacked
                    value={
                      <>
                        <span>{formatKhepreeDevicesCount(t, devicesUsed, devicesMax)}</span>
                        {devicesUsed != null && devicesMax != null && devicesMax > 0 ? (
                          <div
                            className="khepree-account__devices-bar"
                            role="progressbar"
                            aria-valuenow={devicesUsed}
                            aria-valuemin={0}
                            aria-valuemax={devicesMax}
                            aria-label={t('khepree.account.devices')}
                          >
                            <div
                              className="khepree-account__devices-fill"
                              style={{ width: `${devicesPct}%` }}
                            />
                          </div>
                        ) : null}
                      </>
                    }
                  />
                  <KhepreeInfoRow
                    label={t('khepree.account.renewal')}
                    value={renewal ?? '—'}
                  />
                </dl>
              </section>
            </div>
          </div>

          <footer className="khepree-account__actions">
            <div className="khepree-account__actions-group">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  navigate('/khepree/plan');
                }}
              >
                {t('khepree.account.upgradePlan')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  openKhepreeExternal('devices');
                }}
              >
                {t('khepree.account.manageDevices')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  openKhepreeExternal('account');
                }}
              >
                {t('khepree.account.openAccount')}
              </Button>
            </div>
            <Button type="button" variant="ghost" onClick={() => void window.khepreeNovelAI.khepree.signOut()}>
              <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
              {t('khepree.account.signOut')}
            </Button>
          </footer>
        </>
      )}
    </Card>
  );
}
