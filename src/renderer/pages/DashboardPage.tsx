import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorPanel, Skeleton } from '../components/ui';
import { useT } from '../i18n';
import { useNotificationStore } from '../stores/notification-store';
import { useUpdateStatus } from '../hooks/useUpdateStatus';
import { ModalPortal } from '../components/overlay/ModalPortal';
import { CreateProjectWizard } from '../components/CreateProjectWizard';
import { BatchImportPreflightWizard } from '../components/BatchImportPreflightWizard';
import { DashboardHeader } from '../features/dashboard/DashboardHeader';
import { DashboardPrimaryActions } from '../features/dashboard/DashboardPrimaryActions';
import { DashboardNewbieOnboarding } from '../features/dashboard/DashboardNewbieOnboarding';
import { DashboardActiveCampaign } from '../features/dashboard/DashboardActiveCampaign';
import { DashboardAttentionCard } from '../features/dashboard/DashboardAttentionCard';
import { DashboardAccountStatus } from '../features/dashboard/DashboardAccountStatus';
import { DashboardRecentCompletions } from '../features/dashboard/DashboardRecentCompletions';
import { DashboardSystemNoticeBanner } from '../features/dashboard/DashboardSystemNotice';
import { useDashboardHome } from '../features/dashboard/useDashboardHome';
import { resolveDashboardSystemNotice } from '../features/dashboard/resolve-dashboard-home';

export function DashboardPage() {
  const t = useT();
  const navigate = useNavigate();
  const home = useDashboardHome();
  const update = useUpdateStatus();
  const notifications = useNotificationStore((s) => s.items);

  const [showImportOne, setShowImportOne] = useState(false);
  const [showImportMany, setShowImportMany] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const topAnnouncement = useMemo(() => {
    return (
      notifications.find(
        (n) =>
          n.khepreePublicId &&
          !n.read &&
          (n.kind === 'ERROR' ||
            n.kind === 'ACTION_REQUIRED' ||
            n.kind === 'WARNING'),
      ) ?? null
    );
  }, [notifications]);

  const systemNotice = useMemo(() => {
    if (noticeDismissed) return null;
    return resolveDashboardSystemNotice({
      online: home.online,
      updatePhase: update.status?.phase ?? null,
      updateVersion: update.status?.latestVersion ?? null,
      announcementTitle: topAnnouncement?.title ?? null,
    });
  }, [
    noticeDismissed,
    home.online,
    update.status?.phase,
    update.status?.latestVersion,
    topAnnouncement?.title,
  ]);

  const showNewbie =
    !home.loading && home.activeProjects.length === 0;

  if (home.loading) {
    return (
      <div className="dashboard-page dashboard-page--home">
        <DashboardHeader />
        <Skeleton className="dashboard-skeleton-card" height={72} />
        <Skeleton className="dashboard-skeleton-row" height={120} />
        <Skeleton className="dashboard-skeleton-row" height={120} />
      </div>
    );
  }

  if (home.essentialError) {
    return (
      <div className="dashboard-page dashboard-page--home">
        <DashboardHeader />
        <ErrorPanel
          title={t('dashboard.loadErrorTitle')}
          description={t('dashboard.loadErrorDesc')}
          technical={home.essentialError}
          actions={[
            {
              label: t('app.tryAgain'),
              onClick: () => {
                home.refresh();
              },
              primary: true,
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="dashboard-page dashboard-page--home">
      <DashboardHeader />

      {systemNotice ? (
        <DashboardSystemNoticeBanner
          notice={systemNotice}
          onDismiss={
            systemNotice.kind === 'offline'
              ? undefined
              : () => setNoticeDismissed(true)
          }
        />
      ) : null}

      {wizardError ? (
        <div className="banner banner-warning" style={{ marginBottom: '0.75rem' }}>
          {wizardError}
        </div>
      ) : null}

      <DashboardPrimaryActions
        onImportOne={() => setShowImportOne(true)}
        onImportMany={() => setShowImportMany(true)}
      />

      {showNewbie ? (
        <DashboardNewbieOnboarding
          steps={home.newbieSteps}
          onImportOne={() => setShowImportOne(true)}
          onConnectAccount={() => {
            navigate('/accounts');
          }}
          onStartTranslate={() => {
            navigate('/jobs?tab=campaigns');
          }}
        />
      ) : null}

      {home.activeCampaign ? (
        <DashboardActiveCampaign campaign={home.activeCampaign} />
      ) : null}

      <DashboardAttentionCard attention={home.attention} />

      <DashboardAccountStatus
        lanes={home.accountLanes}
        hasReady={home.readyAccount}
      />

      {!showNewbie ? (
        <DashboardRecentCompletions items={home.recentCompletions} />
      ) : null}

      <ModalPortal
        open={showImportOne}
        onBackdropClick={() => setShowImportOne(false)}
        contentClassName="projects-wizard-modal"
      >
        <CreateProjectWizard
          onCancel={() => setShowImportOne(false)}
          onComplete={async () => {
            setShowImportOne(false);
            home.refresh();
          }}
          onError={(message) => setWizardError(message)}
        />
      </ModalPortal>

      <ModalPortal
        open={showImportMany}
        onBackdropClick={() => setShowImportMany(false)}
        contentClassName="projects-wizard-modal"
      >
        <BatchImportPreflightWizard
          onClose={() => setShowImportMany(false)}
          onError={(message) => setWizardError(message)}
        />
      </ModalPortal>
    </div>
  );
}
