import { useCallback, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  OFFICIAL_CONTACT_ORDER,
  OFFICIAL_CONTACTS,
  type OfficialContactChannel,
} from '@shared/constants/official-contacts';
import { useT } from '../../i18n';
import { useNotificationStore } from '../../stores/notification-store';
import { openOfficialContact } from '../../utils/open-official-contact';
import { SocialChannelIcon } from './SocialChannelIcon';

const LABEL_KEYS: Record<OfficialContactChannel, string> = {
  facebook: 'contact.facebook',
  youtube: 'contact.youtube',
  tiktok: 'contact.tiktok',
  telegram: 'contact.telegram',
  zalo: 'contact.zalo',
};

const ACTION_KEYS: Record<OfficialContactChannel, string> = {
  facebook: 'contact.openFacebook',
  youtube: 'contact.openYoutube',
  tiktok: 'contact.openTiktok',
  telegram: 'contact.openTelegram',
  zalo: 'contact.openZalo',
};

interface OfficialContactCardsProps {
  className?: string;
}

export function OfficialContactCards({ className }: OfficialContactCardsProps) {
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
    <div className={className ? `official-contact-grid ${className}` : 'official-contact-grid'}>
      {OFFICIAL_CONTACT_ORDER.map((channel) => {
        const contact = OFFICIAL_CONTACTS[channel];
        return (
          <button
            key={channel}
            type="button"
            className={`official-contact-card official-contact-card--${channel}`}
            aria-label={t(ACTION_KEYS[channel])}
            onClick={() => {
              void handleOpen(channel);
            }}
          >
            <span className="official-contact-card__icon" aria-hidden="true">
              <SocialChannelIcon channel={channel} />
            </span>
            <span className="official-contact-card__body">
              <span className="official-contact-card__label">{t(LABEL_KEYS[channel])}</span>
              <span className="official-contact-card__display">{contact.display}</span>
            </span>
            <ExternalLink
              className="official-contact-card__external"
              size={16}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

interface OfficialContactSectionProps {
  className?: string;
}

export function OfficialContactSection({ className }: OfficialContactSectionProps) {
  const t = useT();

  return (
    <section className={className ? `official-contact-section ${className}` : 'official-contact-section'}>
      <h2 className="official-contact-section__title">{t('contact.title')}</h2>
      <p className="official-contact-section__intro">{t('contact.subtitle')}</p>
      <p className="official-contact-section__support muted">{t('contact.communityDescription')}</p>
      <OfficialContactCards />
    </section>
  );
}
