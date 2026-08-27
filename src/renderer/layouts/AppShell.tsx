import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Languages,
  BookMarked,
  Users,
  ListTodo,
  ScrollText,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Bell,
  HelpCircle,
  BookOpen,
  CircleUser,
  Brain,
  Archive,
} from 'lucide-react';
import type { GetInfoResponse } from '@shared/schemas/ipc';
import { useT } from '../i18n';
import { helpArticleForRoute } from '../features/help/content';
import { useUiShellStore, applyDensity } from '../stores/ui-shell-store';
import { useNotificationStore } from '../stores/notification-store';
import { IconButton, Drawer, Button, WorkerStatus } from '../components/ui';
import { ToastViewport } from '../components/shell/ToastViewport';
import { useSystemStatusPoll } from '../hooks/useSystemStatusPoll';
import { useStartupAiReadiness } from '../hooks/useStartupAiReadiness';
import { useSourceFolderEvents } from '../hooks/useSourceFolderEvents';

interface AppShellProps {
  children: ReactNode;
  appInfo: GetInfoResponse;
}

const MAIN_NAV = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', key: 'nav.projects', icon: FolderKanban },
  { to: '/ai-memory', key: 'nav.aiMemory', icon: Brain },
  { to: '/translation', key: 'nav.translation', icon: Languages },
  { to: '/terms', key: 'nav.terms', icon: BookMarked },
  { to: '/characters', key: 'nav.characters', icon: Users },
  { to: '/accounts', key: 'nav.accounts', icon: CircleUser },
  { to: '/jobs', key: 'nav.jobs', icon: ListTodo },
  { to: '/export', key: 'nav.export', icon: Archive },
  { to: '/logs', key: 'nav.logs', icon: ScrollText },
  { to: '/help', key: 'nav.help', icon: BookOpen },
] as const;

const ROUTE_TITLE: Record<string, string> = {
  '/': 'nav.dashboard',
  '/projects': 'nav.projects',
  '/translation': 'nav.translation',
  '/editor': 'nav.translation',
  '/ai-memory': 'nav.aiMemory',
  '/terms': 'nav.terms',
  '/characters': 'nav.characters',
  '/accounts': 'nav.accounts',
  '/jobs': 'nav.jobs',
  '/logs': 'nav.logs',
  '/help': 'nav.help',
  '/settings': 'nav.settings',
  '/export': 'nav.export',
  '/learning': 'nav.learning',
  '/diagnostics': 'nav.diagnostics',
};

export function AppShell({ children, appInfo }: AppShellProps) {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    sidebarCollapsed,
    sidebarPinned,
    density,
    currentProjectName,
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
    return () => { window.removeEventListener('keydown', onKey); };
  }, [navigate, location.pathname]);

  const unread = notifications.filter((n) => !n.read).length;
  const pageKey =
    ROUTE_TITLE[location.pathname] ??
    (location.pathname.includes('/ai-memory')
      ? 'nav.aiMemory'
      : location.pathname.startsWith('/projects')
        ? 'nav.projects'
        : 'nav.dashboard');
  const flush = location.pathname === '/translation' || location.pathname === '/editor';

  const shellClass = useMemo(() => {
    const parts = ['app-shell'];
    if (sidebarCollapsed) parts.push('sidebar-collapsed');
    if (sidebarPinned) parts.push('sidebar-pinned');
    return parts.join(' ');
  }, [sidebarCollapsed, sidebarPinned]);

  const workerEmail = status.primaryWorkerEmail;
  const workerHealth = status.primaryWorkerHealth;

  return (
    <div className={shellClass}>
      <div className="title-bar-drag" />
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <h1>{t('app.name')}</h1>
            <span className="version">v{appInfo.version}</span>
          </div>
          <IconButton
            label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </IconButton>
        </div>
        <nav className="sidebar-nav" aria-label={t('common.mainNav')}>
          {MAIN_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) => {
                  const aiActive =
                    item.to === '/ai-memory' &&
                    location.pathname.includes('/ai-memory');
                  return isActive || aiActive ? 'nav-link active' : 'nav-link';
                }}
                title={t(item.key)}
              >
                <Icon aria-hidden />
                <span>{t(item.key)}</span>
              </NavLink>
            );
          })}
          <div className="sidebar-nav-divider" />
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            title={t('nav.settings')}
          >
            <Settings aria-hidden />
            <span>{t('nav.settings')}</span>
          </NavLink>
        </nav>
      </aside>

      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-breadcrumb">
            <strong>{t(pageKey)}</strong>
            {currentProjectName ? (
              <>
                <span aria-hidden>/</span>
                <span>{currentProjectName}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="topbar-right">
          <div className="topbar-meta">
            <span>{t('topbar.googleAi')}</span>
            <WorkerStatus email={workerEmail} status={workerHealth ?? 'READY'} />
          </div>
          <IconButton
            label={t('topbar.notifications')}
            active={notifOpen}
            onClick={() => { setNotifOpen(true); }}
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
          <IconButton label={t('nav.help')} onClick={() => { navigate(`/help/${helpArticleForRoute(location.pathname)}`); }}>
            <HelpCircle size={18} />
          </IconButton>
        </div>
      </header>

      <main className={flush ? 'main-content main-content--flush' : 'main-content'}>
        {!startupAi.dismissed &&
        startupAi.result &&
        !startupAi.result.ok &&
        !startupAi.checking &&
        startupAi.title ? (
          <div className="banner banner-error" style={{ margin: '0.75rem 1rem 0' }} role="status">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ flex: '1 1 220px' }}>
                <strong>{startupAi.title}</strong>
                {startupAi.description ? ` — ${startupAi.description}` : ''}
              </span>
              <div className="btn-row">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigate('/accounts');
                  }}
                >
                  {t('notifications.startupBannerCtaAccounts')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigate('/settings?tab=aiProviders');
                  }}
                >
                  {t('notifications.startupBannerCtaProviders')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    void startupAi.refresh();
                  }}
                >
                  {t('notifications.startupBannerRecheck')}
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

      <footer className="statusbar">
        <span>{t('app.name')}</span>
        <span className="statusbar-sep">|</span>
        <span>{t('statusbar.dbReady')}</span>
        <span className="statusbar-sep">|</span>
        <span>
          {t('statusbar.googleAi', {
            ready: status.workersReady,
            total: status.workersTotal,
          })}
        </span>
        <span className="statusbar-sep">|</span>
        <span>{t('statusbar.jobsRunning', { count: status.jobsRunning })}</span>
        <span className="statusbar-sep">|</span>
        <span>{t('statusbar.version', { version: appInfo.version })}</span>
      </footer>

      <Drawer
        open={notifOpen}
        title={t('notifications.title')}
        onClose={() => { setNotifOpen(false); }}
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
                      <Button size="sm" onClick={() => { markRead(n.id); }}>
                        {t('actions.markRead')}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => { remove(n.id); }}>
                      {t('actions.deleteNotification')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <ToastViewport />
    </div>
  );
}
