import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, shouldAutoDismissToast } from '../../stores/notification-store';
import { useT } from '../../i18n';
import { Button, IconButton } from '../ui';
import { X } from 'lucide-react';
import { STARTUP_AI_NOTIFY_ID } from '../../utils/startup-ai-readiness';

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
      window.setTimeout(() => {
        scheduled.current.delete(item.id);
        markRead(item.id);
      }, 5000);
    }
  }, [toasts, markRead]);

  if (toasts.length === 0) return null;

  return (
    <div className="nt-toast-viewport" aria-live="polite">
      {toasts.slice(0, 3).map((item) => (
        <div key={item.id} className="nt-toast" role="status">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>{item.title}</h4>
            <p>{item.description}</p>
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
  );
}
