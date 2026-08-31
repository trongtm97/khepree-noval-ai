import { AppBrand } from './shell/AppBrand';
import { t } from '../i18n';

export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <AppBrand className="app-brand--loading" />
      <div className="loading-spinner" aria-hidden="true" />
      <p>{t('app.loadingApp')}</p>
    </div>
  );
}
