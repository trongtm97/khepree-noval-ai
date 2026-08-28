import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingScreen } from './components/LoadingScreen';
import { ProjectScopedRedirect } from './components/routing/ProjectScopedRedirect';
import { AppShell } from './layouts/AppShell';
import { ProjectWorkspace } from './layouts/ProjectWorkspace';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectSourcePage } from './pages/ProjectSourcePage';
import { ProjectInfoPage } from './pages/ProjectInfoPage';
import { AiMemoryPage } from './pages/AiMemoryPage';
import { TranslationEditorPage } from './pages/TranslationEditorPage';
import { PortabilityPage } from './pages/PortabilityPage';
import { ProjectDataPage } from './pages/ProjectDataPage';
import { TermsPage } from './pages/TermsPage';
import { CharactersPage } from './pages/CharactersPage';
import { AccountsPage } from './pages/AccountsPage';
import { JobsPage } from './pages/JobsPage';
import { LearningPage } from './pages/LearningPage';
import { SettingsPage } from './pages/SettingsPage';
import { LogsPage } from './pages/LogsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { HelpPage } from './features/help/HelpPage';
import {
  applyTheme,
  useThemeStore,
  watchSystemTheme,
} from './stores/theme-store';
import { useT, t as i18nT } from './i18n';
import type { GetInfoResponse } from '@shared/schemas/ipc';
import type { SetupStatus } from '@shared/schemas/setup';

export function App() {
  const t = useT();
  const themeMode = useThemeStore((state) => state.mode);
  const [appInfo, setAppInfo] = useState<GetInfoResponse | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(themeMode);
    if (themeMode !== 'system') {
      return;
    }
    return watchSystemTheme(() => applyTheme('system'));
  }, [themeMode]);

  useEffect(() => {
    const alive = { current: true };

    void (async () => {
      try {
        const [info, setup] = await Promise.all([
          window.novelTrans.getInfo(),
          window.novelTrans.setup.getStatus(),
        ]);
        if (alive.current) {
          setAppInfo(info);
          setSetupStatus(setup);
          setLoadError(null);
        }
      } catch (error: unknown) {
        if (alive.current) {
          const message =
            error instanceof Error ? error.message : i18nT('app.failedStart');
          setLoadError(message);
        }
      }
    })();

    return () => {
      alive.current = false;
    };
  }, []);

  const enterApp = async () => {
    const setup = await window.novelTrans.setup.getStatus();
    setSetupStatus(setup);
  };

  if (loadError) {
    return (
      <div className="error-boundary">
        <h2>{t('app.failedStart')}</h2>
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('app.reload')}
        </button>
      </div>
    );
  }

  if (!appInfo || !setupStatus) {
    return <LoadingScreen />;
  }

  const showOnboarding = !setupStatus.completed && !setupStatus.explored;

  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <SetupWizardPage
          onComplete={() => {
            void enterApp();
          }}
          onExplore={() => {
            void enterApp();
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppShell appInfo={appInfo}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />

            <Route path="/projects/:projectId" element={<ProjectWorkspace />}>
              <Route index element={<ProjectInfoPage />} />
              <Route path="chapters" element={<ProjectSourcePage />} />
              <Route path="translate" element={<TranslationEditorPage />} />
              <Route path="ai-memory" element={<AiMemoryPage />} />
              <Route path="terms" element={<TermsPage />} />
              <Route path="characters" element={<CharactersPage />} />
              <Route path="data" element={<ProjectDataPage />} />
              <Route path="export" element={<PortabilityPage />} />
              <Route path="info" element={<Navigate to=".." replace />} />
              <Route path="source" element={<Navigate to="../chapters" replace />} />
            </Route>

            <Route path="/translation" element={<ProjectScopedRedirect tab="translate" />} />
            <Route path="/editor" element={<ProjectScopedRedirect tab="translate" />} />
            <Route path="/ai-memory" element={<ProjectScopedRedirect tab="ai-memory" />} />
            <Route path="/terms" element={<ProjectScopedRedirect tab="terms" />} />
            <Route path="/characters" element={<ProjectScopedRedirect tab="characters" />} />
            <Route path="/export" element={<ProjectScopedRedirect tab="export" />} />

            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/help" element={<HelpPage appInfo={appInfo} />} />
            <Route path="/help/:articleId" element={<HelpPage appInfo={appInfo} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
