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
import { TranslationPickPage } from './pages/TranslationPickPage';
import { PortabilityPage } from './pages/PortabilityPage';
import { ProjectDataPage } from './pages/ProjectDataPage';
import { TermsPage } from './pages/TermsPage';
import { CharactersPage } from './pages/CharactersPage';
import { AccountsPage } from './pages/AccountsPage';
import { ProductionPage } from './pages/ProductionPage';
import { SeriesPage } from './pages/SeriesPage';
import { LibrarySearchPage } from './pages/LibrarySearchPage';
import { LearningPage } from './pages/LearningPage';
import { SettingsPage } from './pages/SettingsPage';
import { LogsPage } from './pages/LogsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { LanguageFirstRunPage } from './pages/LanguageFirstRunPage';
import { KhepreeLayout } from './features/khepree/KhepreeLayout';
import { KhepreeAboutPage } from './features/khepree/pages/KhepreeAboutPage';
import { KhepreeAccountPage } from './features/khepree/pages/KhepreeAccountPage';
import { KhepreePlanPage } from './features/khepree/pages/KhepreePlanPage';
import { KhepreeDevicesPage } from './features/khepree/pages/KhepreeDevicesPage';
import { KhepreeAccessGate } from './features/khepree/KhepreeAccessGate';
import { useKhepreeAccessState } from './features/khepree/useKhepreeAccessState';
import { HelpPage } from './features/help/HelpPage';
import { OverlayPlaygroundPage } from './pages/dev/OverlayPlaygroundPage';
import {
  applyTheme,
  useThemeStore,
  watchSystemTheme,
} from './stores/theme-store';
import { useT, t as i18nT, applyUiLanguageStatus } from './i18n';
import type { GetInfoResponse } from '@shared/schemas/ipc';
import type { SetupStatus } from '@shared/schemas/setup';
import type { UiLanguageStatus } from '@shared/schemas/ui-language';

export function App() {
  const t = useT();
  const themeMode = useThemeStore((state) => state.mode);
  const [appInfo, setAppInfo] = useState<GetInfoResponse | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [uiLanguage, setUiLanguage] = useState<UiLanguageStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { state: khepreeState, loading: khepreeLoading, error: khepreeError } =
    useKhepreeAccessState();

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
        const [info, setup, language] = await Promise.all([
          window.khepreeNovelAI.getInfo(),
          window.khepreeNovelAI.setup.getStatus(),
          window.khepreeNovelAI.uiLanguage.get(),
        ]);
        if (!alive.current) return;
        applyUiLanguageStatus(language);
        setAppInfo(info);
        setSetupStatus(setup);
        setUiLanguage(language);
        setLoadError(null);
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
    const setup = await window.khepreeNovelAI.setup.getStatus();
    setSetupStatus(setup);
  };

  const completeLanguageFirstRun = async () => {
    const language = await window.khepreeNovelAI.uiLanguage.get();
    applyUiLanguageStatus(language);
    setUiLanguage(language);
  };

  const startupError = loadError ?? khepreeError;

  if (startupError) {
    return (
      <div className="error-boundary">
        <h2>{t('app.failedStart')}</h2>
        <p>{startupError}</p>
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

  if (!appInfo || !setupStatus || !uiLanguage || khepreeLoading || !khepreeState) {
    return <LoadingScreen />;
  }

  if (uiLanguage.needsFirstRunChooser) {
    return (
      <ErrorBoundary>
        <LanguageFirstRunPage
          onComplete={() => {
            void completeLanguageFirstRun();
          }}
        />
      </ErrorBoundary>
    );
  }

  const appContent = (() => {
    const showOnboarding = !setupStatus.completed && !setupStatus.explored;

    if (showOnboarding) {
      return (
        <SetupWizardPage
          onComplete={() => {
            void enterApp();
          }}
          onExplore={() => {
            void enterApp();
          }}
        />
      );
    }

    return (
      <BrowserRouter>
        <AppShell appInfo={appInfo}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/series" element={<SeriesPage />} />
            <Route path="/series/:seriesId" element={<SeriesPage />} />
            <Route path="/search" element={<LibrarySearchPage />} />

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

            <Route path="/translation/pick" element={<TranslationPickPage />} />
            <Route path="/translation" element={<ProjectScopedRedirect tab="translate" />} />
            <Route path="/editor" element={<ProjectScopedRedirect tab="translate" />} />
            <Route path="/ai-memory" element={<ProjectScopedRedirect tab="ai-memory" />} />
            <Route path="/terms" element={<ProjectScopedRedirect tab="terms" />} />
            <Route path="/characters" element={<ProjectScopedRedirect tab="characters" />} />
            <Route path="/export" element={<ProjectScopedRedirect tab="export" />} />

            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/jobs" element={<ProductionPage />} />
            <Route path="/jobs/campaigns/:campaignId" element={<ProductionPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/khepree" element={<KhepreeLayout />}>
              <Route index element={<Navigate to="account" replace />} />
              <Route path="account" element={<KhepreeAccountPage />} />
              <Route path="plan" element={<KhepreePlanPage />} />
              <Route path="devices" element={<KhepreeDevicesPage />} />
              <Route path="about" element={<KhepreeAboutPage appInfo={appInfo} />} />
            </Route>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/help" element={<HelpPage appInfo={appInfo} />} />
            <Route path="/help/:articleId" element={<HelpPage appInfo={appInfo} />} />
            {import.meta.env.DEV ? (
              <Route path="/dev/overlay-playground" element={<OverlayPlaygroundPage />} />
            ) : null}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    );
  })();

  return (
    <ErrorBoundary>
      <KhepreeAccessGate state={khepreeState}>{appContent}</KhepreeAccessGate>
    </ErrorBoundary>
  );
}
