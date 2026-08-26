import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingScreen } from './components/LoadingScreen';
import { AppShell } from './layouts/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectSourcePage } from './pages/ProjectSourcePage';
import { ProjectInfoPage } from './pages/ProjectInfoPage';
import { AiMemoryPage } from './pages/AiMemoryPage';
import { TranslationEditorPage } from './pages/TranslationEditorPage';
import { PortabilityPage } from './pages/PortabilityPage';
import { TermsPage } from './pages/TermsPage';
import { CharactersPage } from './pages/CharactersPage';
import { AccountsPage } from './pages/AccountsPage';
import { JobsPage } from './pages/JobsPage';
import { LearningPage } from './pages/LearningPage';
import { SettingsPage } from './pages/SettingsPage';
import { LogsPage } from './pages/LogsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { HelpPage } from './features/help/HelpPage';
import {
  applyTheme,
  useThemeStore,
  watchSystemTheme,
} from './stores/theme-store';
import { useT, t as i18nT } from './i18n';
import type { GetInfoResponse } from '@shared/schemas/ipc';

export function App() {
  const t = useT();
  const themeMode = useThemeStore((state) => state.mode);
  const [appInfo, setAppInfo] = useState<GetInfoResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(themeMode);
    if (themeMode !== 'system') {
      return;
    }
    return watchSystemTheme(() => applyTheme('system'));
  }, [themeMode]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [info, setup] = await Promise.all([
          window.novelTrans.getInfo(),
          window.novelTrans.setup.getStatus(),
        ]);
        // Skip first-run wizard — open app shell immediately; accounts added later.
        if (!setup.completed) {
          await window.novelTrans.setup.complete({ confirm: true });
        }
        if (!cancelled) {
          setAppInfo(info);
          setLoadError(null);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : i18nT('app.failedStart');
          setLoadError(message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  if (!appInfo) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppShell appInfo={appInfo}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId/info" element={<ProjectInfoPage />} />
            <Route path="/projects/:projectId/source" element={<ProjectSourcePage />} />
            <Route path="/projects/:projectId/ai-memory" element={<AiMemoryPage />} />
            <Route path="/ai-memory" element={<AiMemoryPage />} />
            <Route path="/translation" element={<TranslationEditorPage />} />
            <Route path="/editor" element={<Navigate to="/translation" replace />} />
            <Route path="/export" element={<PortabilityPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/characters" element={<CharactersPage />} />
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
