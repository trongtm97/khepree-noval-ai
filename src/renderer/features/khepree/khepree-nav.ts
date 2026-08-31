export const KHEPREE_NAV_ITEMS = [
  { path: 'account', labelKey: 'khepree.nav.account' },
  { path: 'plan', labelKey: 'khepree.nav.plan' },
  { path: 'devices', labelKey: 'khepree.nav.devices' },
  { path: 'about', labelKey: 'khepree.nav.about' },
] as const;

export type KhepreeNavPath = (typeof KHEPREE_NAV_ITEMS)[number]['path'];

export function parseKhepreeNavPath(segment: string | undefined): KhepreeNavPath {
  const found = KHEPREE_NAV_ITEMS.find((item) => item.path === segment);
  return found?.path ?? 'account';
}
