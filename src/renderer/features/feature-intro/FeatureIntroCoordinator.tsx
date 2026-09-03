import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FeatureIntroStateDto } from '@shared/schemas/feature-intro';
import { useNotificationStore } from '../../stores/notification-store';
import { useUpdateStatus } from '../../hooks/useUpdateStatus';
import { WhatsNewModal } from './WhatsNewModal';
import { FeatureTour } from './FeatureTour';
import { useFeatureIntroUiStore } from './feature-intro-store';

export function FeatureIntroCoordinator() {
  const [state, setState] = useState<FeatureIntroStateDto | null>(null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const tourRequestToken = useFeatureIntroUiStore((s) => s.tourRequestToken);
  const notifications = useNotificationStore((s) => s.items);
  const { status: updateStatus } = useUpdateStatus();

  const refresh = useCallback(async () => {
    const next = await window.khepreeNovelAI.featureIntro.getState();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const blocked = useMemo(() => {
    const mandatoryUpdate =
      updateStatus?.mandatoryUpdate &&
      (updateStatus.phase === 'downloaded' || updateStatus.phase === 'available');
    const actionRequiredAnn = notifications.some(
      (n) => !n.read && n.kind === 'ACTION_REQUIRED' && Boolean(n.khepreePublicId),
    );
    return mandatoryUpdate || actionRequiredAnn;
  }, [notifications, updateStatus]);

  useEffect(() => {
    if (!state || blocked) return;
    if (state.shouldShowWhatsNew) {
      setWhatsNewOpen(true);
    }
  }, [state, blocked]);

  useEffect(() => {
    if (tourRequestToken === 0) return;
    void window.khepreeNovelAI.featureIntro.updateTour({ reset: true }).then((next) => {
      setState(next);
      setTourOpen(true);
    });
  }, [tourRequestToken]);

  const closeWhatsNew = async (mode: 'close' | 'never') => {
    const next = await window.khepreeNovelAI.featureIntro.dismiss({ mode });
    setState(next);
    setWhatsNewOpen(false);
    if (!next.tourCompleted && !next.tourSkipped) {
      setTourOpen(true);
    }
  };

  const skipTour = async () => {
    const next = await window.khepreeNovelAI.featureIntro.updateTour({ skipped: true });
    setState(next);
    setTourOpen(false);
  };

  const completeTour = async () => {
    const next = await window.khepreeNovelAI.featureIntro.updateTour({ completed: true });
    setState(next);
    setTourOpen(false);
  };

  return (
    <>
      <WhatsNewModal
        open={whatsNewOpen && !blocked}
        onClose={() => void closeWhatsNew('close')}
        onNeverShow={() => void closeWhatsNew('never')}
      />
      <FeatureTour
        open={tourOpen && !whatsNewOpen && !blocked}
        onSkip={() => void skipTour()}
        onComplete={() => void completeTour()}
      />
    </>
  );
}
