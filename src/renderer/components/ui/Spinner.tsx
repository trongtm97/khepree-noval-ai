import { t } from '../../i18n';

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <span
      className="loading-spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label={t('common.loading')}
    />
  );
}
