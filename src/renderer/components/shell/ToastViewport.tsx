import { useEffect, useMemo, useRef } from 'react';
import { useNotificationStore } from '../../stores/notification-store';
import { useT } from '../../i18n';
import { IconButton } from '../ui';
import { X } from 'lucide-react';

export function ToastViewport() {
  const t = useT();
  const allItems = useNotificationStore((s) => s.items);
  const markRead = useNotificationStore((s) => s.markRead);
  const toasts = useMemo(() => allItems.filter((i) => i.toast), [allItems]);
  const scheduled = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const item of toasts) {
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
          <div style={{ flex: 1 }}>
            <h4>{item.title}</h4>
            <p>{item.description}</p>
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
