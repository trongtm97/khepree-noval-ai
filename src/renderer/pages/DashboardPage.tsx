import { useNavigate } from 'react-router-dom';
import { isJobActive } from '@shared/utils/job-progress';
import { EmptyState, ErrorPanel, Skeleton } from '../components/ui';
import { useT } from '../i18n';
import { useUiShellStore } from '../stores/ui-shell-store';
import { DashboardHeader } from '../features/dashboard/DashboardHeader';
import { ContinueProjectCard } from '../features/dashboard/ContinueProjectCard';
import { ActionRequiredSection } from '../features/dashboard/ActionRequiredSection';
import { RunningJobsSection } from '../features/dashboard/RunningJobsSection';
import { RecentActivitySection } from '../features/dashboard/RecentActivitySection';
import { DashboardOnboarding } from '../features/dashboard/DashboardOnboarding';
import { DashboardSummaryStrip } from '../features/dashboard/DashboardSummaryStrip';
import { useDashboardData } from '../features/dashboard/useDashboardData';

export function DashboardPage() {
  const t = useT();
  const navigate = useNavigate();
  const dashboardReadyShown = useUiShellStore((s) => s.dashboardReadyShown);
  const setDashboardReadyShown = useUiShellStore((s) => s.setDashboardReadyShown);

  const {
    projects,
    priorityProject,
    priorityNewChapterCount,
    runningJobs,
    actions,
    activity,
    readiness,
    onboardingSteps,
    loading,
    essentialError,
    refresh,
    jobs,
  } = useDashboardData();

  const activeProjects = projects.filter((p) => p.status !== 'archived');
  const showReadyBanner = readiness.onboardingComplete && !dashboardReadyShown && !loading;
  const showOnboarding = !readiness.onboardingComplete && !loading;
  const totalRunning = jobs.filter((j) => isJobActive(j.state)).length;

  if (loading) {
    return (
      <div className="dashboard-page">
        <DashboardHeader />
        <Skeleton className="dashboard-skeleton-card" height={180} />
        <Skeleton className="dashboard-skeleton-row" height={48} />
        <Skeleton className="dashboard-skeleton-row" height={48} />
      </div>
    );
  }

  if (essentialError) {
    return (
      <div className="dashboard-page">
        <DashboardHeader />
        <ErrorPanel
          title={t('dashboard.loadErrorTitle')}
          description={t('dashboard.loadErrorDesc')}
          technical={essentialError}
          actions={[
            {
              label: t('app.tryAgain'),
              onClick: () => {
                refresh();
              },
              primary: true,
            },
          ]}
        />
      </div>
    );
  }

  if (activeProjects.length === 0) {
    return (
      <div className="dashboard-page">
        <DashboardHeader />
        <EmptyState
          title={t('dashboard.noProjects')}
          description={t('dashboard.noProjectsHint')}
          actionLabel={t('actions.createProject')}
          onAction={() => {
            navigate('/projects');
          }}
        />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <DashboardHeader />

      {showReadyBanner ? (
        <DashboardOnboarding
          steps={onboardingSteps}
          showReadyBanner
          onDismissReady={() => {
            setDashboardReadyShown(true);
          }}
        />
      ) : null}

      {showOnboarding ? <DashboardOnboarding steps={onboardingSteps} /> : null}

      <DashboardSummaryStrip projects={projects} actions={actions} />

      {priorityProject ? (
        <section className="dashboard-section dashboard-section--priority">
          <ContinueProjectCard
            project={priorityProject}
            newChapterCount={priorityNewChapterCount}
          />
        </section>
      ) : null}

      <ActionRequiredSection actions={actions} />

      <RunningJobsSection
        jobs={runningJobs}
        projects={projects}
        totalRunning={totalRunning}
      />

      {runningJobs.length === 0 ? <RecentActivitySection events={activity} /> : null}
    </div>
  );
}
