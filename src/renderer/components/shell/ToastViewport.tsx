import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, shouldAutoDismissToast } from '../../stores/notification-store';
import { useT } from '../../i18n';
import { Button, IconButton } from '../ui';
import { X } from 'lucide-react';
import { STARTUP_AI_NOTIFY_ID } from '../../utils/startup-ai-readiness';
import { OverlayPortal } from '../overlay/OverlayPortal';

export function ToastViewport({
  onStartupRecheck,
}: {
  onStartupRecheck?: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const allItems = useNotificationStore((s) => s.items);
  const markRead = useNotificationStore((s) => s.markRead);
  const toasts = useMemo(() => allItems.filter((i) => i.toast), [allItems]);
  const scheduled = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const item of toasts) {
      if (!shouldAutoDismissToast(item.kind)) continue;
      if (scheduled.current.has(item.id)) continue;
      scheduled.current.add(item.id);
      const duration = item.toastDurationMs ?? 5000;
      window.setTimeout(() => {
        scheduled.current.delete(item.id);
        markRead(item.id);
      }, duration);
    }
  }, [toasts, markRead]);

  if (toasts.length === 0) return null;

  return (
    <OverlayPortal>
      <div className="nt-toast-viewport" aria-live="polite" data-nt-overlay="toast">
      {toasts.slice(0, 3).map((item) => (
        <div key={item.id} className="nt-toast" role="status">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>{item.title}</h4>
            <p>{item.description}</p>
            {item.toastActions && item.toastActions.length > 0 ? (
              <div className="nt-toast__actions">
                {item.toastActions.map((action) => (
                  <Button
                    key={`${action.action}-${action.path}`}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      markRead(item.id);
                      if (action.action === 'open-file') {
                        void window.novelTrans.portability.openExportedFile({
                          projectId: item.projectId ?? '',
                          filePath: action.path,
                        });
                      } else {
                        void window.novelTrans.portability.openExportDirectory({
                          projectId: item.projectId ?? '',
                        });
                      }
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            ) : null}
            {item.id === STARTUP_AI_NOTIFY_ID ? (
              <div className="btn-row" style={{ marginTop: '0.5rem' }}>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onStartupRecheck?.();
                  }}
                >
                  {t('notifications.startupBannerRetry')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    markRead(item.id);
                    navigate('/settings?tab=aiProviders');
                  }}
                >
                  {t('notifications.startupBannerCtaSettings')}
                </Button>
              </div>
            ) : null}
          </div>
          <IconButton
            label={t('actions.close')}
            onClick={() => {
              markRead(item.id);
            }}
          >
            <X size={14} />
          </IconButton>
        </div>
      ))}
      </div>
    </OverlayPortal>
  );
}
