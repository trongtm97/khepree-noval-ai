export const OFFICIAL_CONTACT_CHANNEL_IDS = [
  'facebook',
  'youtube',
  'tiktok',
  'telegram',
  'zalo',
] as const;

export type OfficialContactChannel = (typeof OFFICIAL_CONTACT_CHANNEL_IDS)[number];

export interface OfficialContact {
  id: OfficialContactChannel;
  url: string;
  display: string;
}

export const OFFICIAL_CONTACTS = {
  facebook: {
    id: 'facebook',
    url: 'https://www.facebook.com/KhepreeLabs',
    display: 'Khepree Labs',
  },
  youtube: {
    id: 'youtube',
    url: 'https://www.youtube.com/@KhepreeLabs',
    display: 'KhepreeLabs',
  },
  tiktok: {
    id: 'tiktok',
    url: 'https://www.tiktok.com/@khepreelabs',
    display: 'khepreelabs',
  },
  telegram: {
    id: 'telegram',
    url: 'https://t.me/KhepreeLabs',
    display: 'KhepreeLabs',
  },
  zalo: {
    id: 'zalo',
    url: 'https://zalo.me/0867268149',
    display: '0867.268.149',
  },
} as const satisfies Record<OfficialContactChannel, OfficialContact>;

export const OFFICIAL_CONTACT_ORDER: readonly OfficialContactChannel[] = [
  'facebook',
  'youtube',
  'tiktok',
  'telegram',
  'zalo',
];

/** Exact hostnames allowed for official contact HTTPS links. */
export const APPROVED_OFFICIAL_CONTACT_HOSTS = new Set([
  'www.facebook.com',
  'youtube.com',
  'www.youtube.com',
  'tiktok.com',
  'www.tiktok.com',
  't.me',
  'zalo.me',
]);

export function isOfficialContactChannel(value: string): value is OfficialContactChannel {
  return (OFFICIAL_CONTACT_CHANNEL_IDS as readonly string[]).includes(value);
}

export function resolveOfficialContactUrl(channel: OfficialContactChannel): string {
  return OFFICIAL_CONTACTS[channel].url;
}
