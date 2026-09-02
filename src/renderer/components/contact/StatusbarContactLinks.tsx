import { useCallback, useRef } from 'react';
import { OFFICIAL_CONTACT_ORDER, type OfficialContactChannel } from '@shared/constants/official-contacts';
import { useT } from '../../i18n';
import { useNotificationStore } from '../../stores/notification-store';
import { openOfficialContact } from '../../utils/open-official-contact';
import { SocialChannelIcon } from './SocialChannelIcon';

const ACTION_KEYS: Record<OfficialContactChannel, string> = {
  facebook: 'contact.openFacebook',
  youtube: 'contact.openYoutube',
  tiktok: 'contact.openTiktok',
  telegram: 'contact.openTelegram',
  zalo: 'contact.openZalo',
};

export function StatusbarContactLinks() {
  const t = useT();
  const add = useNotificationStore((s) => s.add);
  const openingRef = useRef(false);

  const showOpenError = useCallback(() => {
    add({
      kind: 'ERROR',
      title: t('contact.openErrorTitle'),
      description: t('contact.openError'),
      toast: true,
      toastDurationMs: 4000,
    });
  }, [add, t]);

  const handleOpen = useCallback(
    async (channel: OfficialContactChannel) => {
      if (openingRef.current) return;
      openingRef.current = true;
      try {
        const ok = await openOfficialContact(channel);
        if (!ok) showOpenError();
      } catch {
        showOpenError();
      } finally {
        openingRef.current = false;
      }
    },
    [showOpenError],
  );

  return (
    <div className="statusbar-contacts" role="group" aria-label={t('statusbar.contactGroup')}>
      <span className="statusbar-contacts__label">{t('statusbar.contactLabel')}</span>
      {OFFICIAL_CONTACT_ORDER.map((channel) => (
        <button
          key={channel}
          type="button"
          className={`statusbar-contact-btn statusbar-contact-btn--${channel}`}
          title={t(ACTION_KEYS[channel])}
          aria-label={t(ACTION_KEYS[channel])}
          onClick={() => {
            void handleOpen(channel);
          }}
        >
          <SocialChannelIcon channel={channel} />
        </button>
      ))}
    </div>
  );
}
