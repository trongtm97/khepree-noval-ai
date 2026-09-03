import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useNotificationStore,
  shouldAutoDismissToast,
  resolveToastDurationMs,
} from '../../stores/notification-store';
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
  const dismissToast = useNotificationStore((s) => s.dismissToast);
  const markRead = useNotificationStore((s) => s.markRead);
  const toasts = useMemo(() => allItems.filter((i) => i.toast), [allItems]);
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    const activeIds = new Set(toasts.map((item) => item.id));

    for (const [id, timerId] of timers.entries()) {
      if (!activeIds.has(id)) {
        window.clearTimeout(timerId);
        timers.delete(id);
      }
    }

    for (const item of toasts) {
      if (!shouldAutoDismissToast(item.kind)) continue;
      if (timers.has(item.id)) continue;
      const duration = resolveToastDurationMs(item.kind, item.toastDurationMs);
      const timerId = window.setTimeout(() => {
        timers.delete(item.id);
        dismissToast(item.id);
      }, duration);
      timers.set(item.id, timerId);
    }
  }, [toasts, dismissToast]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timerId of timers.values()) {
        window.clearTimeout(timerId);
      }
      timers.clear();
    };
  }, []);

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
                        void window.khepreeNovelAI.portability.openExportedFile({
                          projectId: item.projectId ?? '',
                          filePath: action.path,
                        });
                      } else {
                        void window.khepreeNovelAI.portability.openExportDirectory({
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
                    navigate('/settings?tab=ai');
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
              dismissToast(item.id);
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
