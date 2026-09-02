import { NavLink } from 'react-router-dom';
import { CreditCard, Info, Monitor, User } from 'lucide-react';
import { useT } from '../../../i18n';
import { KHEPREE_NAV_ITEMS, type KhepreeNavPath } from '../khepree-nav';

const TAB_ICONS: Record<KhepreeNavPath, typeof User> = {
  account: User,
  plan: CreditCard,
  devices: Monitor,
  about: Info,
};

export function KhepreeTabs() {
  const t = useT();

  return (
    <nav className="khepree-hub__tabs" aria-label={t('khepree.hub.title')}>
      {KHEPREE_NAV_ITEMS.map((item) => {
        const Icon = TAB_ICONS[item.path];
        return (
          <NavLink
            key={item.path}
            to={`/khepree/${item.path}`}
            className={({ isActive }) =>
              `khepree-hub__tab${isActive ? ' khepree-hub__tab--active' : ''}`
            }
            end
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
