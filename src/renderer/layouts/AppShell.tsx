import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Languages,
  ListTodo,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Bell,
  HelpCircle,
  BookOpen,
  CircleUser,
  Shield,
} from 'lucide-react';
import type { GetInfoResponse } from '@shared/schemas/ipc';
import { useT } from '../i18n';
import { helpArticleForRoute } from '../features/help/content';
import { useUiShellStore, applyDensity } from '../stores/ui-shell-store';
import { useNotificationStore } from '../stores/notification-store';
import { AppBrand } from '../components/shell/AppBrand';
import { IconButton, Drawer, Button } from '../components/ui';
import { ToastViewport } from '../components/shell/ToastViewport';
import { StatusbarContactLinks } from '../components/contact/StatusbarContactLinks';
import { useSystemStatusPoll } from '../hooks/useSystemStatusPoll';
import { useStartupAiReadiness } from '../hooks/useStartupAiReadiness';
import { useSourceFolderEvents } from '../hooks/useSourceFolderEvents';
import {
  isProjectWorkspacePath,
} from './ProjectWorkspace';
import {
  isTranslationWorkspaceRoute,
  isTranslationNavActive,
  resolveTranslationDestination,
} from './translation-shell-mode';
import { useTranslationWorkspaceStore } from '../stores/translation-workspace-store';
import { resolveBreadcrumb } from '../features/dashboard/resolve-breadcrumb';

interface AppShellProps {
  children: ReactNode;
  appInfo: GetInfoResponse;
}

const PRIMARY_NAV = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', key: 'nav.projects', icon: FolderKanban },
  { to: '__translation__', key: 'nav.translation', icon: Languages, translation: true },
  { to: '/jobs', key: 'nav.jobs', icon: ListTodo },
] as const;

const SECONDARY_NAV = [
  { to: '/accounts', key: 'nav.accounts', icon: CircleUser },
  { to: '/khepree', key: 'nav.khepree', icon: Shield },
  { to: '/help', key: 'nav.help', icon: BookOpen },
  { to: '/settings', key: 'nav.settings', icon: Settings },
] as const;

export function AppShell({ children, appInfo }: AppShellProps) {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    sidebarCollapsed,
    sidebarPinned,
    density,
    currentProjectName,
    currentProjectId,
    lastTranslationProjectId,
    showAdvancedTools,
    toggleSidebar,
  } = useUiShellStore();
  const notifications = useNotificationStore((s) => s.items);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const remove = useNotificationStore((s) => s.remove);
  const [notifOpen, setNotifOpen] = useState(false);
  const status = useSystemStatusPoll();
  const startupAi = useStartupAiReadiness();
  useSourceFolderEvents();

  const editorFocusMode = useTranslationWorkspaceStore((s) => s.focusMode);
  const translationFocus = isTranslationWorkspaceRoute(location.pathname);

  useEffect(() => {
    applyDensity(density);
  }, [density]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        navigate('/settings');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        const articleId = helpArticleForRoute(location.pathname);
        navigate(`/help/${articleId}`);
        return;
      }
      if (location.pathname.startsWith('/help') && (e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('help-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [navigate, location.pathname, toggleSidebar]);

  const unread = notifications.filter((n) => !n.read).length;
  const inProject = isProjectWorkspacePath(location.pathname);
  const breadcrumb = resolveBreadcrumb(
    location.pathname,
    currentProjectId && currentProjectName
      ? { id: currentProjectId, name: currentProjectName }
      : null,
  );
  const flush = translationFocus;
  const mainClass = flush
    ? 'main-content main-content--flush'
    : inProject
      ? 'main-content main-content--project'
      : 'main-content';

  const shellClass = useMemo(() => {
    const parts = ['app-shell'];
    if (sidebarCollapsed) parts.push('sidebar-collapsed');
    if (sidebarPinned) parts.push('sidebar-pinned');
    if (translationFocus) parts.push('app-shell--translation-focus');
    if (editorFocusMode) parts.push('app-shell--editor-focus');
    return parts.join(' ');
  }, [sidebarCollapsed, sidebarPinned, translationFocus, editorFocusMode]);

  const navActive = (to: string, isActive: boolean) => {
    if (to === '/projects') {
      return location.pathname === '/projects';
    }
    if (to === '/jobs') {
      return isActive || location.pathname.startsWith('/jobs');
    }
    if (to === '__translation__') {
      return isTranslationNavActive(location.pathname);
    }
    return isActive;
  };

  const goTranslation = () => {
    const dest = resolveTranslationDestination({
      lastTranslationProjectId,
      currentProjectId,
    });
    navigate(dest.path);
  };

  return (
    <div className={shellClass}>
      <div className="title-bar-drag" />
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <AppBrand showVersion={appInfo.version} />
          </div>
          <IconButton
            label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </IconButton>
        </div>
        <nav className="sidebar-nav" aria-label={t('common.mainNav')}>
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            if (item.to === '__translation__') {
              return (
                <button
                  key={item.key}
                  type="button"
                  className={
                    navActive(item.to, false)
                      ? 'nav-link nav-link--translation active'
                      : 'nav-link nav-link--translation'
                  }
                  title={t(item.key)}
                  aria-label={t(item.key)}
                  aria-current={navActive(item.to, false) ? 'page' : undefined}
                  onClick={goTranslation}
                >
                  <Icon aria-hidden />
                  <span>{t(item.key)}</span>
                </button>
              );
            }
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  navActive(item.to, isActive) ? 'nav-link active' : 'nav-link'
                }
                title={t(item.key)}
              >
                <Icon aria-hidden />
                <span>{t(item.key)}</span>
              </NavLink>
            );
          })}
          <div className="sidebar-nav-divider" />
          {SECONDARY_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                title={t(item.key)}
              >
                <Icon aria-hidden />
                <span>{t(item.key)}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <header className={translationFocus ? 'topbar topbar--compact' : 'topbar'}>
        {!translationFocus ? (
          <div className="topbar-left">
            {!inProject ? (
              <div className="topbar-breadcrumb">
                {breadcrumb.map((segment, index) => (
                  <span key={`${segment.labelKey ?? segment.text}-${index}`}>
                    {index > 0 ? (
                      <>
                        <span aria-hidden> / </span>
                      </>
                    ) : null}
                    {index === 0 && breadcrumb.length === 1 ? (
                      <strong>
                        {segment.labelKey ? t(segment.labelKey) : segment.text}
                      </strong>
                    ) : index === 0 ? (
                      <span>{segment.labelKey ? t(segment.labelKey) : segment.text}</span>
                    ) : (
                      <strong>{segment.text ?? (segment.labelKey ? t(segment.labelKey) : '')}</strong>
                    )}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="topbar-left">
            <span className="topbar-location muted">{t('nav.translation')}</span>
          </div>
        )}
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-ops"
            title={t('topbar.openOperations')}
            onClick={() => {
              navigate('/jobs');
            }}
          >
            <span>
              {t('topbar.streamsRunning', { count: status.jobsRunning })}
            </span>
            <span className="topbar-ops-sep" aria-hidden>
              ·
            </span>
            <span>
              {t('topbar.accountsReady', { count: status.accountsReady })}
            </span>
          </button>
          <IconButton
            label={t('topbar.notifications')}
            active={notifOpen}
            onClick={() => {
              setNotifOpen(true);
            }}
          >
            <Bell size={18} />
            {unread > 0 ? (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--error)',
                }}
              />
            ) : null}
          </IconButton>
          <IconButton
            label={t('nav.help')}
            onClick={() => {
              navigate(`/help/${helpArticleForRoute(location.pathname)}`);
            }}
          >
            <HelpCircle size={18} />
          </IconButton>
        </div>
      </header>

      <main className={mainClass}>
        {!startupAi.dismissed &&
        startupAi.result &&
        !startupAi.result.ok &&
        !startupAi.checking &&
        startupAi.title &&
        !translationFocus ? (
          <div
            className="banner banner-error startup-ai-banner"
            style={{ margin: '0.75rem 1rem 0' }}
            role="status"
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ flex: '1 1 220px' }}>
                <strong>{startupAi.title}</strong>
                {startupAi.description ? ` — ${startupAi.description}` : ''}
              </span>
              <div className="btn-row">
                {startupAi.result.issues.includes('check_failed') ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      navigate('/settings?tab=ai');
                    }}
                  >
                    {t('notifications.startupBannerCtaSettings')}
                  </Button>
                ) : null}
                {startupAi.result.issues.includes('no_google_account') ||
                startupAi.result.issues.includes('google_needs_login') ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigate('/accounts');
                    }}
                  >
                    {t('notifications.startupBannerCtaAccounts')}
                  </Button>
                ) : null}
                {startupAi.result.issues.includes('no_ai_provider') ||
                startupAi.result.issues.includes('web_api_not_ready') ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigate('/settings?tab=ai');
                    }}
                  >
                    {t('notifications.startupBannerCtaProviders')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={
                    startupAi.result.issues.includes('check_failed') ? 'secondary' : 'primary'
                  }
                  onClick={() => {
                    void startupAi.refresh();
                  }}
                >
                  {startupAi.result.issues.includes('check_failed')
                    ? t('notifications.startupBannerRetry')
                    : t('notifications.startupBannerRecheck')}
                </Button>
                <Button size="sm" variant="ghost" onClick={startupAi.dismiss}>
                  {t('notifications.startupBannerDismiss')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {children}
      </main>

      {!translationFocus ? (
        <footer className="statusbar">
          <div className="statusbar__primary">
            <span>{t('app.name')}</span>
            {showAdvancedTools ? (
              <>
                <span className="statusbar-sep">|</span>
                <span>{t('statusbar.dbReady')}</span>
              </>
            ) : null}
            <span className="statusbar-sep">|</span>
            <span>
              {status.jobsRunning > 0
                ? t('statusbar.streamsRunning', { count: status.jobsRunning })
                : t('statusbar.idle')}
            </span>
            {status.jobsRunning === 0 &&
            status.accountsReady < status.workersTotal &&
            status.workersTotal > 0 ? (
              <>
                <span className="statusbar-sep">|</span>
                <span className="statusbar-warning">{t('statusbar.accountsIssue')}</span>
              </>
            ) : null}
            <span className="statusbar-sep">|</span>
            <span>{t('statusbar.version', { version: appInfo.version })}</span>
          </div>
          <StatusbarContactLinks />
        </footer>
      ) : null}

      <Drawer
        open={notifOpen}
        title={t('notifications.title')}
        onClose={() => {
          setNotifOpen(false);
        }}
        closeLabel={t('actions.close')}
      >
        <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
          <Button size="sm" onClick={markAllRead}>
            {t('actions.markAllRead')}
          </Button>
        </div>
        {notifications.length === 0 ? (
          <p className="muted">{t('notifications.empty')}</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`nt-notif-item ${n.read ? '' : 'nt-notif-item--unread'}`}
              >
                <span
                  className={`nt-status-dot nt-status-dot--${
                    n.kind === 'SUCCESS'
                      ? 'ready'
                      : n.kind === 'ERROR'
                        ? 'error'
                        : n.kind === 'WARNING' || n.kind === 'ACTION_REQUIRED'
                          ? 'warning'
                          : 'running'
                  }`}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: 'var(--font-body)' }}>
                    {n.title}
                  </strong>
                  <p style={{ margin: '0.15rem 0', fontSize: 'var(--font-small)' }}>
                    {n.description}
                  </p>
                  <span className="muted" style={{ fontSize: 'var(--font-small)' }}>
                    {new Date(n.timestamp).toLocaleString()}
                    {n.projectName ? ` · ${n.projectName}` : ''}
                  </span>
                  <div className="btn-row" style={{ marginTop: '0.35rem' }}>
                    {!n.read ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          markRead(n.id);
                        }}
                      >
                        {t('actions.markRead')}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        remove(n.id);
                      }}
                    >
                      {t('actions.deleteNotification')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <ToastViewport onStartupRecheck={() => void startupAi.refresh()} />
    </div>
  );
}
