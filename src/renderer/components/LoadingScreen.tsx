import { t } from '../i18n';

export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" aria-hidden="true" />
      <p>{t('app.loadingApp')}</p>
    </div>
  );
}
