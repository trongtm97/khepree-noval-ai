import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProductionCompletionEvent } from '@shared/schemas/delivery-completion';
import { useNotificationStore } from '../stores/notification-store';

function mapKind(
  event: ProductionCompletionEvent,
): 'SUCCESS' | 'WARNING' | 'INFO' {
  if (event.kind === 'CAMPAIGN_NEEDS_ATTENTION') return 'WARNING';
  if (event.kind === 'CAMPAIGN_COMPLETED' || event.kind === 'PROJECT_DELIVERED') {
    return 'SUCCESS';
  }
  return 'INFO';
}

/** Subscribe to main-process delivery/campaign completion; durable upsert + optional navigate. */
export function useProductionCompletionEvents(): void {
  const upsert = useNotificationStore((s) => s.upsert);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = window.khepreeNovelAI.production.onCompletion((event) => {
      const toastActions = [];
      if (event.primaryFilePath) {
        toastActions.push({
          label: 'Mở file',
          action: 'open-file' as const,
          path: event.primaryFilePath,
        });
      } else if (event.outputDirectory) {
        toastActions.push({
          label: 'Mở thư mục',
          action: 'open-folder' as const,
          path: event.outputDirectory,
        });
      }

      upsert({
        id: event.id,
        kind: mapKind(event),
        title: event.title,
        description: event.description,
        projectId: event.projectId ?? undefined,
        projectName: event.projectTitle ?? undefined,
        route: event.route ?? undefined,
        toast: !event.openTarget,
        toastActions: toastActions.length > 0 ? toastActions : undefined,
      });

      if (event.openTarget && event.route) {
        navigate(event.route);
      }
    });
    return unsubscribe;
  }, [upsert, navigate]);
}
