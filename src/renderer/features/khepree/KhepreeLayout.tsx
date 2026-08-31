import { NavLink, Outlet } from 'react-router-dom';
import { useT } from '../../i18n';
import { PageHeader } from '../../components/ui';
import { KHEPREE_NAV_ITEMS } from './khepree-nav';

export function KhepreeLayout() {
  const t = useT();

  return (
    <div className="settings-page khepree-hub">
      <PageHeader title={t('khepree.hub.title')} description={t('khepree.hub.subtitle')} />

      <div className="settings-workspace">
        <nav className="settings-side-nav khepree-hub__nav" aria-label={t('khepree.hub.title')}>
          {KHEPREE_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={`/khepree/${item.path}`}
              className={({ isActive }) =>
                `settings-side-nav__item${isActive ? ' active' : ''}`
              }
              end
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="settings-content khepree-hub__content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
